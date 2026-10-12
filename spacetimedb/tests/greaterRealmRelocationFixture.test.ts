import assert from 'node:assert/strict';
import test from 'node:test';
import { Fixture, MemoryTable, type Row, clone, errorCode, fixtureResourceMutationCallbacks, resourcePrimaryUpdateLeases, resourceReadIndexLeases, withFixedResourceReadIndex, withFixedResourceTransitionIndex, withResourcePrimaryUpdateIndex, withResourceReadIndex } from './greaterRealmRelocationTestSupport';



test('resource fixture index preserves first-match updates after direct row edits between operations', () => {
  const original = [
    { nodeId: 'a', marker: 'first-a', active: false },
    { nodeId: 'b', marker: 'b', active: false },
    { nodeId: 'c', marker: 'c', active: false },
  ];
  const indexed = new MemoryTable('nodeId', {}, original);
  const linear = new MemoryTable('nodeId', {}, original);
  let indexedMutations = 0;
  let linearMutations = 0;
  indexed.mutate = () => { indexedMutations += 1; };
  linear.mutate = () => { linearMutations += 1; };
  fixtureResourceMutationCallbacks.set(indexed, indexed.mutate);
  const updateAll = (table: MemoryTable) => {
    for (const row of table.iter()) table.nodeId.update({ ...row, active: !row.active });
  };
  const changes: readonly ((table: MemoryTable) => void)[] = [
    () => {},
    table => { table.rows = [...clone(original)].reverse(); },
    table => { table.rows.push({ nodeId: 'd', marker: 'push', active: false }); },
    table => { table.rows.splice(1, 1, { nodeId: 'e', marker: 'splice', active: false }); },
    table => { table.rows.unshift({ nodeId: 'c', marker: 'earlier-duplicate', active: false }); },
    table => { table.rows.shift(); table.rows.reverse(); },
    table => {
      const retainedAlias = table.rows.at(-1)!;
      retainedAlias.nodeId = table.rows[0]!.nodeId;
      retainedAlias.marker = 'later-duplicate-via-alias';
    },
    table => {
      const retainedAlias = table.rows[0]!;
      retainedAlias.nodeId = 'changed-before-next-operation';
      table.rows.splice(0, 0, { nodeId: retainedAlias.nodeId, marker: 'new-first', active: false });
    },
  ];
  for (const change of changes) {
    change(indexed);
    change(linear);
    withResourcePrimaryUpdateIndex(indexed, () => updateAll(indexed));
    updateAll(linear);
    assert.deepEqual(indexed.rows, linear.rows);
    assert.equal(indexedMutations, linearMutations);
    assert.equal(resourcePrimaryUpdateLeases.has(indexed), false);
  }
});

test('resource fixture index falls back for a replaced mutator that inserts an earlier duplicate', () => {
  const exercise = (registered: boolean) => {
    const table = new MemoryTable('nodeId', {}, [
      { nodeId: 'a', marker: 'original', active: false },
    ]);
    const pureMutate = table.mutate;
    if (registered) fixtureResourceMutationCallbacks.set(table, pureMutate);
    let mutations = 0;
    table.mutate = () => {
      mutations += 1;
      table.rows.unshift({ nodeId: 'a', marker: 'callback-first', active: false });
    };
    withResourcePrimaryUpdateIndex(table, () => table.nodeId.update({
      nodeId: 'a', marker: 'updated-first', active: true,
    }));
    return { rows: table.rows, mutations };
  };
  assert.deepEqual(exercise(true), exercise(false));
  assert.deepEqual(exercise(true).rows.map(row => row.marker), ['updated-first', 'original']);
});

test('fixed resource transition falls back when another fixture table has a custom mutator', () => {
  const fixture = new Fixture();
  const resources = fixture.tables.greaterRealmResourceNodeV1;
  const key = resources.rows[0]!.nodeId;
  withFixedResourceTransitionIndex(fixture.ctx, () => {
    assert.equal(resourcePrimaryUpdateLeases.has(resources), true);
  });
  withFixedResourceReadIndex(fixture.ctx, () => {
    assert.equal(resourceReadIndexLeases.has(resources), true);
  });
  fixture.tables.castle.mutate = () => {
    resources.rows.unshift({ ...resources.rows[0]!, marker: 'earlier-callback-row' });
  };
  withFixedResourceTransitionIndex(fixture.ctx, () => {
    assert.equal(resourcePrimaryUpdateLeases.has(resources), false);
    fixture.tables.castle.mutate();
    resources.nodeId.update({ ...resources.rows[1]!, nodeId: key, marker: 'updated-first' });
  });
  assert.equal(resources.rows[0]!.marker, 'updated-first');
  assert.equal(resources.rows[1]!.marker, undefined);
  withFixedResourceReadIndex(fixture.ctx, () => {
    assert.equal(resourceReadIndexLeases.has(resources), false);
  });
});

test('resource fixture index releases on injected failure and rebuilds after row restoration', () => {
  const exercise = (indexed: boolean) => {
    const table = new MemoryTable('nodeId', {}, [
      { nodeId: 'a', marker: 'first', active: false },
      { nodeId: 'b', marker: 'second', active: false },
    ]);
    const before = clone(table.rows);
    let mutations = 0;
    let faultAt: number | undefined = 2;
    table.mutate = () => {
      mutations += 1;
      if (mutations === faultAt) throw new Error('INJECTED_TRANSACTION_FAULT');
    };
    if (indexed) fixtureResourceMutationCallbacks.set(table, table.mutate);
    const updateAll = () => {
      for (const row of table.iter()) table.nodeId.update({ ...row, active: true });
    };
    assert.throws(() => withResourcePrimaryUpdateIndex(table, updateAll), {
      message: 'INJECTED_TRANSACTION_FAULT',
    });
    assert.equal(resourcePrimaryUpdateLeases.has(table), false);
    assert.deepEqual(table.rows.map(row => row.active), [true, false]);
    table.rows = clone(before);
    table.rows[0]!.nodeId = 'restored-new-key';
    mutations = 0;
    faultAt = undefined;
    withResourcePrimaryUpdateIndex(table, updateAll);
    assert.equal(resourcePrimaryUpdateLeases.has(table), false);
    return { rows: table.rows, mutations };
  };
  assert.deepEqual(exercise(true), exercise(false));
});

test('resource fixture index preserves linear semantics for non-string keys and key accessors', () => {
  const exercise = (indexed: boolean, kind: 'nan' | 'undefined' | 'accessor') => {
    const table = new MemoryTable('nodeId', {}, [{ nodeId: 'a', marker: 'first' }]);
    let getterReads = 0;
    if (kind === 'accessor') {
      Object.defineProperty(table.rows[0]!, 'nodeId', {
        enumerable: true, configurable: true,
        get: () => { getterReads += 1; return 'a'; },
      });
    } else table.rows[0]!.nodeId = kind === 'nan' ? Number.NaN : undefined;
    if (indexed) fixtureResourceMutationCallbacks.set(table, table.mutate);
    const message = errorCode(() => withResourcePrimaryUpdateIndex(table, () => (
      table.nodeId.update({ nodeId: kind === 'nan' ? Number.NaN : kind === 'undefined' ? undefined : 'a', marker: 'updated' })
    )));
    return { message, rows: clone(table.rows), getterReads };
  };
  for (const kind of ['nan', 'undefined', 'accessor'] as const) {
    assert.deepEqual(exercise(true, kind), exercise(false, kind));
  }
});

test('resource fixture index rejects key/order changes inside its fixed-write lease and always releases', () => {
  const table = new MemoryTable('nodeId', {}, [{ nodeId: 'a', active: false }]);
  fixtureResourceMutationCallbacks.set(table, table.mutate);
  assert.throws(() => withResourcePrimaryUpdateIndex(table, () => {
    table.rows[0]!.nodeId = 'unsupported-mid-operation-edit';
  }), /fixed resource transition changed resource keys\/order/);
  assert.equal(resourcePrimaryUpdateLeases.has(table), false);
  withResourcePrimaryUpdateIndex(table, () => table.nodeId.update({
    nodeId: 'unsupported-mid-operation-edit', active: true,
  }));
  assert.equal(table.rows[0]!.active, true);
});

test('fixture UUIDs allocate on creation, stringify stably and preserve transaction sequence rollback', () => {
  const fixture = new Fixture();
  const first = fixture.ctx.newUuidV7();
  const second = fixture.ctx.newUuidV7();
  assert.equal(first.toString(), '00000000-0000-7000-8000-000000000001');
  assert.equal(first.toString(), first.toString());
  assert.equal(second.toString(), '00000000-0000-7000-8000-000000000002');
  assert.equal(fixture.uuidSequence, 2);
  let rolledBackUuid: { toString(): string } | undefined;
  assert.throws(() => fixture.transaction(() => {
    rolledBackUuid = fixture.ctx.newUuidV7();
    throw new Error('UUID_TRANSACTION_ROLLBACK');
  }), /UUID_TRANSACTION_ROLLBACK/);
  assert.equal(fixture.uuidSequence, 2);
  assert.equal(rolledBackUuid!.toString(), '00000000-0000-7000-8000-000000000003');
  assert.equal(fixture.ctx.newUuidV7().toString(), rolledBackUuid!.toString());
  assert.equal(first.toString(), '00000000-0000-7000-8000-000000000001');
});

test('resource fixture read index preserves ordered location and compound duplicates with live rows', () => {
  const table = new MemoryTable('nodeId', {
    locationId: 'locationId',
    byComponentAndResourceKind: ['componentKey', 'resourceKind'],
  }, [
    { nodeId: 'a', locationId: 'l1', componentKey: 'c1', resourceKind: 'food', marker: 'first' },
    { nodeId: 'b', locationId: 'l2', componentKey: 'c1', resourceKind: 'food', marker: 'second' },
    { nodeId: 'a', locationId: 'l1', componentKey: 'c1', resourceKind: 'food', marker: 'duplicate' },
    { nodeId: 'd', locationId: 'l1', componentKey: 'c1', resourceKind: 'wood', marker: 'wood' },
  ]);
  fixtureResourceMutationCallbacks.set(table, table.mutate);
  withResourceReadIndex(table, () => {
    assert.equal(resourceReadIndexLeases.has(table), true);
    const byLocation = table.locationId.filter('l1') as Row[];
    assert.deepEqual(byLocation.map(row => row.marker), ['first', 'duplicate', 'wood']);
    assert.equal(byLocation[0], table.rows[0]);
    assert.equal(byLocation[1], table.rows[2]);
    assert.equal(byLocation[2], table.rows[3]);
    assert.notEqual(byLocation, table.locationId.filter('l1'));
    byLocation.pop();
    assert.equal(table.locationId.filter('l1').length, 3);
    const compound = table.byComponentAndResourceKind.filter(['c1', 'food']) as Row[];
    assert.deepEqual(compound.map(row => row.marker), ['first', 'second', 'duplicate']);
    assert.equal(compound[2], table.rows[2]);
    compound[2]!.marker = 'changed-live-field';
    assert.equal(table.locationId.filter('l1')[1], compound[2]);
    assert.equal(table.locationId.filter('l1')[1].marker, 'changed-live-field');
    assert.deepEqual(table.locationId.filter('absent'), []);
    assert.deepEqual(table.byComponentAndResourceKind.filter(['c1']), []);
    assert.deepEqual(table.byComponentAndResourceKind.filter(['c1', 1]), []);
    let reads = 0;
    const accessorQuery = ['c1', 'food'];
    Object.defineProperty(accessorQuery, '0', { get: () => { reads += 1; return 'c1'; } });
    assert.equal(table.byComponentAndResourceKind.filter(accessorQuery).length, 3);
    assert.equal(reads, table.rows.length);
  });
  assert.equal(resourceReadIndexLeases.has(table), false);
  const proxyQueryResult = (
    registered: boolean,
    empty: boolean,
    variant: 'throwing' | 'stateful' | 'revoked',
  ) => {
    const rows = empty ? [] : table.rows;
    const fixtureTable = new MemoryTable('nodeId', {
      byComponentAndResourceKind: ['componentKey', 'resourceKind'],
    }, rows);
    if (registered) fixtureResourceMutationCallbacks.set(fixtureTable, fixtureTable.mutate);
    const reads: string[] = [];
    let lengths = 0;
    const revocable = Proxy.revocable(['c1', 'food'], {
      get: (target, property, receiver) => {
        reads.push(String(property));
        if (property === 'length') {
          if (variant === 'throwing') throw new Error('QUERY_LENGTH_FAILURE');
          if (variant === 'stateful') return lengths++ % 2 === 0 ? 2 : 1;
        }
        return Reflect.get(target, property, receiver);
      },
    });
    if (variant === 'revoked') revocable.revoke();
    let markers: string[] | undefined;
    let error: string | undefined;
    try {
      markers = withResourceReadIndex(fixtureTable, () => (
        fixtureTable.byComponentAndResourceKind.filter(revocable.proxy)
          .map((row: Row) => row.marker)
      ));
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    assert.equal(resourceReadIndexLeases.has(fixtureTable), false);
    return { markers, error, reads };
  };
  for (const empty of [true, false]) {
    for (const variant of ['throwing', 'stateful', 'revoked'] as const) {
      assert.deepEqual(proxyQueryResult(true, empty, variant), proxyQueryResult(false, empty, variant));
      if (empty) assert.deepEqual(proxyQueryResult(true, empty, variant), {
        markers: [], error: undefined, reads: [],
      });
    }
  }
});

test('resource fixture read index rebuilds after direct edits and restoration and releases on throw', () => {
  const original = [
    { nodeId: 'a', locationId: 'l1', componentKey: 'c1', resourceKind: 'food', marker: 'first' },
    { nodeId: 'b', locationId: 'l2', componentKey: 'c1', resourceKind: 'food', marker: 'second' },
    { nodeId: 'a', locationId: 'l1', componentKey: 'c1', resourceKind: 'food', marker: 'duplicate' },
    { nodeId: 'd', locationId: 'l1', componentKey: 'c2', resourceKind: 'wood', marker: 'wood' },
  ];
  const fields = {
    locationId: 'locationId',
    byComponentAndResourceKind: ['componentKey', 'resourceKind'],
  };
  const indexed = new MemoryTable('nodeId', fields, original);
  const linear = new MemoryTable('nodeId', fields, original);
  fixtureResourceMutationCallbacks.set(indexed, indexed.mutate);
  const changes: readonly ((table: MemoryTable) => void)[] = [
    () => {},
    table => { table.rows = [...clone(original)].reverse(); },
    table => { table.rows.push({ ...table.rows[0]!, marker: 'pushed-duplicate' }); },
    table => { table.rows.splice(1, 1, { ...table.rows[0]!, marker: 'spliced-duplicate' }); },
    table => { table.rows.unshift({ ...table.rows[0]!, marker: 'new-first' }); },
    table => { table.rows.shift(); table.rows.reverse(); },
    table => {
      const retainedAlias = table.rows.at(-1)!;
      Object.assign(retainedAlias, { locationId: 'l2', componentKey: 'c2', resourceKind: 'gold' });
    },
    table => { table.rows = clone(original); },
  ];
  const queries = (table: MemoryTable): Row[][] => [
    table.locationId.filter('l1'),
    table.locationId.filter('l2'),
    table.byComponentAndResourceKind.filter(['c1', 'food']),
    table.byComponentAndResourceKind.filter(['c2', 'gold']),
  ];
  for (const change of changes) {
    change(indexed);
    change(linear);
    const actual = withResourceReadIndex(indexed, () => {
      assert.equal(resourceReadIndexLeases.has(indexed), true);
      return queries(indexed);
    });
    assert.deepEqual(actual, queries(linear));
    for (const rows of actual) for (const row of rows) assert.ok(indexed.rows.includes(row));
    assert.equal(resourceReadIndexLeases.has(indexed), false);
  }
  const failure = new Error('INJECTED_RESOURCE_READ_FAILURE');
  assert.throws(() => withResourceReadIndex(indexed, () => { throw failure; }), error => error === failure);
  assert.equal(resourceReadIndexLeases.has(indexed), false);
  indexed.rows = clone(original);
  const retainedAlias = indexed.rows[0]!;
  retainedAlias.locationId = 'after-restoration';
  withResourceReadIndex(indexed, () => {
    assert.deepEqual(indexed.locationId.filter('after-restoration'), [retainedAlias]);
    assert.deepEqual(indexed.locationId.filter('l1'), [indexed.rows[2], indexed.rows[3]]);
  });
  assert.throws(() => withResourceReadIndex(indexed, () => {
    indexed.rows[0]!.componentKey = 'unsupported-mid-call-edit';
  }), /fixed resource read changed an indexed field/);
  assert.equal(resourceReadIndexLeases.has(indexed), false);
  indexed.rows = clone(original);
  assert.throws(() => withResourceReadIndex(indexed, () => { indexed.rows.reverse(); }),
    /fixed resource read changed resource row order/);
  assert.equal(resourceReadIndexLeases.has(indexed), false);
});

test('resource fixture read index preserves linear fallback for malformed fields and custom callbacks', () => {
  const exercise = (registered: boolean, variant: 'field' | 'accessor' | 'mutator') => {
    const table = new MemoryTable('nodeId', {
      locationId: 'locationId',
      byComponentAndResourceKind: ['componentKey', 'resourceKind'],
    }, [{ nodeId: 'a', locationId: 'l1', componentKey: 'c1', resourceKind: 'food', marker: 'original' }]);
    if (registered) fixtureResourceMutationCallbacks.set(table, table.mutate);
    let reads = 0;
    if (variant === 'field') table.rows[0]!.locationId = undefined;
    if (variant === 'accessor') Object.defineProperty(table.rows[0]!, 'locationId', {
      configurable: true, enumerable: true, get: () => { reads += 1; return 'l1'; },
    });
    if (variant === 'mutator') table.mutate = () => {
      table.rows.unshift({ ...table.rows[0]!, marker: 'callback-first' });
    };
    const markers = withResourceReadIndex(table, () => {
      assert.equal(resourceReadIndexLeases.has(table), false);
      if (variant === 'mutator') table.mutate();
      return table.locationId.filter(variant === 'field' ? undefined : 'l1')
        .map((row: Row) => row.marker);
    });
    assert.equal(resourceReadIndexLeases.has(table), false);
    return { markers, reads };
  };
  for (const variant of ['field', 'accessor', 'mutator'] as const) {
    assert.deepEqual(exercise(true, variant), exercise(false, variant));
  }
  assert.deepEqual(exercise(true, 'mutator').markers, ['callback-first', 'original']);
  const uuidFixture = new Fixture();
  const resources = uuidFixture.tables.greaterRealmResourceNodeV1;
  const originalUuid = uuidFixture.ctx.newUuidV7;
  const retainedRow = resources.rows[0]!;
  uuidFixture.ctx.newUuidV7 = () => {
    Object.assign(retainedRow, { nodeId: 'uuid-node', locationId: 'uuid-location' });
    resources.rows.reverse();
    return originalUuid();
  };
  withFixedResourceReadIndex(uuidFixture.ctx, () => {
    assert.equal(resourceReadIndexLeases.has(resources), false);
    assert.equal(uuidFixture.ctx.newUuidV7().toString(), '00000000-0000-7000-8000-000000000001');
    assert.deepEqual(resources.locationId.filter('uuid-location'), [retainedRow]);
  });
  uuidFixture.ctx.newUuidV7 = originalUuid;
  withFixedResourceReadIndex(uuidFixture.ctx, () => {
    assert.equal(resourceReadIndexLeases.has(resources), true);
    assert.deepEqual(resources.locationId.filter('uuid-location'), [retainedRow]);
  });
  let sequence = uuidFixture.uuidSequence;
  Object.defineProperty(uuidFixture, 'uuidSequence', {
    configurable: true, enumerable: true,
    get: () => { resources.rows.reverse(); return sequence; },
    set: (value: number) => { sequence = value; },
  });
  withFixedResourceReadIndex(uuidFixture.ctx, () => {
    assert.equal(resourceReadIndexLeases.has(resources), false);
    assert.equal(uuidFixture.ctx.newUuidV7().toString(), '00000000-0000-7000-8000-000000000002');
    assert.deepEqual(resources.locationId.filter('uuid-location'), [retainedRow]);
  });
});
