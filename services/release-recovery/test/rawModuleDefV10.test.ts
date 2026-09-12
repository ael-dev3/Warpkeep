import { describe, expect, it } from 'vitest'

import {
  RAW_MODULE_DEF_V10_INVALID,
  RAW_MODULE_DEF_V10_SECTION_ORDER,
  parseAndNormalizeRawModuleDefV10,
} from '../src/rawModuleDefV10.js'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function parse(source: string) {
  return parseAndNormalizeRawModuleDefV10(encoder.encode(source))
}

function expectInvalid(source: string): void {
  expect(() => parse(source)).toThrowError(RAW_MODULE_DEF_V10_INVALID)
}

function emptySection(tag: (typeof RAW_MODULE_DEF_V10_SECTION_ORDER)[number]): Record<string, unknown> {
  if (tag === 'Typespace') return { Typespace: { types: [] } }
  if (tag === 'ExplicitNames') return { ExplicitNames: { entries: [] } }
  return { [tag]: [] }
}

type MutableObject = Record<string, any>

const none = (): MutableObject => ({ none: [] })
const some = (value: unknown): MutableObject => ({ some: value })
const unit = (tag: string): MutableObject => ({ [tag]: [] })
const field = (name: string, algebraicType: unknown): MutableObject => ({
  name: some(name),
  algebraic_type: algebraicType,
})
const product = (elements: unknown[]): MutableObject => ({ Product: { elements } })

function scheduleAtType(): MutableObject {
  return {
    Sum: {
      variants: [
        field('Interval', product([field('__time_duration_micros__', unit('I64'))])),
        field('Time', product([field('__timestamp_micros_since_unix_epoch__', unit('I64'))])),
      ],
    },
  }
}

function completeValidModule(): MutableObject {
  const playerRow = product([
    field('id', unit('U64')),
    field('scheduled_at', scheduleAtType()),
    field('score', unit('U16')),
  ])
  const viewRow = product([
    field('id', unit('U64')),
    field('label', unit('String')),
  ])
  const choice = {
    Sum: {
      variants: [
        field('Enabled', product([])),
        field('Disabled', product([])),
      ],
    },
  }
  const rowParam = { elements: [field('row', { Ref: 0 })] }

  return {
    sections: [
      { Typespace: { types: [playerRow, viewRow, choice] } },
      {
        Types: [
          { source_name: { scope: [], source_name: 'PlayerRow' }, ty: 0, custom_ordering: false },
          { source_name: { scope: ['game'], source_name: 'ViewRow' }, ty: 1, custom_ordering: false },
          { source_name: { scope: [], source_name: 'Choice' }, ty: 2, custom_ordering: true },
        ],
      },
      {
        Tables: [
          {
            source_name: 'players',
            product_type_ref: 0,
            primary_key: [0],
            indexes: [
              {
                source_name: some('players_id_idx_btree'),
                accessor_name: some('id'),
                algorithm: { BTree: [0] },
              },
              {
                source_name: some('players_score_idx_direct'),
                accessor_name: none(),
                algorithm: { Direct: 2 },
              },
            ],
            constraints: [
              {
                source_name: some('players_id_key'),
                data: { Unique: { columns: [0] } },
              },
            ],
            sequences: [
              {
                source_name: some('players_id_seq'),
                column: 0,
                start: some(1),
                min_value: some(1),
                max_value: none(),
                increment: 1,
              },
            ],
            table_type: unit('User'),
            table_access: unit('Private'),
            default_values: [{ col_id: 2, value: '2500' }],
            is_event: false,
          },
        ],
      },
      {
        Reducers: [
          {
            source_name: 'scheduled_tick',
            params: rowParam,
            visibility: unit('Private'),
            ok_return_type: product([]),
            err_return_type: unit('String'),
          },
          {
            source_name: 'init',
            params: { elements: [] },
            visibility: unit('Private'),
            ok_return_type: product([]),
            err_return_type: unit('String'),
          },
          {
            source_name: 'set_score',
            params: { elements: [field('score', unit('U16'))] },
            visibility: unit('ClientCallable'),
            ok_return_type: product([]),
            err_return_type: unit('String'),
          },
        ],
      },
      {
        Procedures: [
          {
            source_name: 'lookup_player',
            params: { elements: [field('id', unit('U64'))] },
            return_type: { Ref: 1 },
            visibility: unit('ClientCallable'),
          },
        ],
      },
      { HttpHandlers: [{ source_name: 'health' }] },
      {
        HttpRoutes: [
          { handler_function: 'health', method: unit('Any'), path: '/health' },
          { handler_function: 'health', method: { Method: unit('Get') }, path: '/ready' },
        ],
      },
      {
        Views: [
          {
            source_name: 'visible_players',
            index: 0,
            is_public: true,
            is_anonymous: false,
            params: { elements: [] },
            return_type: { Array: { Ref: 1 } },
          },
        ],
      },
      { ViewPrimaryKeys: [{ view_source_name: 'visible_players', columns: ['id'] }] },
      {
        Schedules: [
          {
            source_name: some('players_sched'),
            table_name: 'players',
            schedule_at_col: 1,
            function_name: 'scheduled_tick',
          },
        ],
      },
      { LifeCycleReducers: [{ lifecycle_spec: unit('Init'), function_name: 'init' }] },
      { RowLevelSecurity: [{ sql: 'SELECT * FROM players WHERE TRUE' }] },
      {
        ExplicitNames: {
          entries: [
            { Table: { source_name: 'players', canonical_name: 'players' } },
            { Function: { source_name: 'set_score', canonical_name: 'set_score' } },
            {
              Index: {
                source_name: 'players_id_idx_btree',
                canonical_name: 'players_id_idx_btree',
              },
            },
          ],
        },
      },
    ],
  }
}

function getSection<T extends MutableObject>(document: MutableObject, tag: string): T {
  const section = (document.sections as MutableObject[]).find(candidate => Object.hasOwn(candidate, tag))
  if (section === undefined) throw new Error(`test fixture missing ${tag}`)
  return section[tag] as T
}

function mutateComplete(mutator: (document: MutableObject) => void): string {
  const document = structuredClone(completeValidModule())
  mutator(document)
  return JSON.stringify(document)
}

function expectDeepFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return
  expect(Object.isFrozen(value)).toBe(true)
  for (const child of Object.values(value)) expectDeepFrozen(child)
}

describe('RawModuleDef v10 normalization', () => {
  it('accepts the exact empty v10 document and returns immutable canonical output', () => {
    const normalized = parseAndNormalizeRawModuleDefV10(encoder.encode('{"sections":[]}'))

    expect(normalized.value).toEqual({ sections: [] })
    expect(decoder.decode(normalized.canonicalBytes())).toBe('{"sections":[]}')
    expect(Object.isFrozen(normalized)).toBe(true)
    expect(Object.isFrozen(normalized.value)).toBe(true)
    expect(Object.isFrozen(normalized.value.sections)).toBe(true)

    const first = normalized.canonicalBytes()
    first[0] = 0
    expect(decoder.decode(normalized.canonicalBytes())).toBe('{"sections":[]}')
  })

  it('exports the independently enumerated server-v10 canonical section order', () => {
    expect(RAW_MODULE_DEF_V10_SECTION_ORDER).toEqual([
      'Typespace',
      'Types',
      'Tables',
      'Reducers',
      'Procedures',
      'HttpHandlers',
      'HttpRoutes',
      'Views',
      'ViewPrimaryKeys',
      'Schedules',
      'LifeCycleReducers',
      'RowLevelSecurity',
      'ExplicitNames',
    ])
    expect(Object.isFrozen(RAW_MODULE_DEF_V10_SECTION_ORDER)).toBe(true)
  })

  it('accepts arbitrary input section order but emits the source-fixed canonical order', () => {
    const sections = [...RAW_MODULE_DEF_V10_SECTION_ORDER]
      .reverse()
      .map(emptySection)

    const normalized = parse(JSON.stringify({ sections }))

    expect(normalized.value.sections.map(section => Object.keys(section as object)[0])).toEqual(
      RAW_MODULE_DEF_V10_SECTION_ORDER,
    )
    expect(decoder.decode(normalized.canonicalBytes())).toBe(
      '{"sections":[{"Typespace":{"types":[]}},{"Types":[]},{"Tables":[]},{"Reducers":[]},{"Procedures":[]},{"HttpHandlers":[]},{"HttpRoutes":[]},{"Views":[]},{"ViewPrimaryKeys":[]},{"Schedules":[]},{"LifeCycleReducers":[]},{"RowLevelSecurity":[]},{"ExplicitNames":{"entries":[]}}]}',
    )
  })

  it('skips absent optional sections without changing the remaining relative order', () => {
    const normalized = parse('{"sections":[{"ExplicitNames":{"entries":[]}},{"Tables":[]}]}')

    expect(normalized.value.sections.map(section => Object.keys(section as object)[0])).toEqual([
      'Tables',
      'ExplicitNames',
    ])
  })

  it.each([
    ['missing sections', '{}'],
    ['extra top-level member', '{"sections":[],"version":10}'],
    ['non-array sections', '{"sections":{}}'],
    ['zero-key section', '{"sections":[{}]}'],
    ['multi-key section', '{"sections":[{"Tables":[],"Types":[]}]}'],
    ['unknown section', '{"sections":[{"Unknown":[]}]}'],
    ['source-only case conversion policy', '{"sections":[{"CaseConversionPolicy":{"None":[]}}]}'],
    ['duplicate section tag', '{"sections":[{"Tables":[]},{"Tables":[]}]}'],
  ])('rejects %s instead of weakening the exact v10 envelope', (_name, source) => {
    expectInvalid(source)
  })

  it.each([
    '{"sections":[],"sections":[]}',
    '{"sections":[],"\\u0073ections":[]}',
    '{"sections":[{"Typespace":{"types":[],"types":[]}}]}',
    '{"sections":[{"Types":[{"source_name":{"scope":[],"source_name":"A"},"ty":0,"ty":0,"custom_ordering":false}]}]}',
  ])('rejects duplicate JSON names before a later value can shadow ABI authority', source => {
    expectInvalid(source)
  })

  it('accepts an exact 2 MiB JSON response but rejects the next byte', () => {
    const base = '{"sections":[]}'
    const atLimit = `${base}${' '.repeat((2 * 1024 * 1024) - base.length)}`

    expect(parse(atLimit).value).toEqual({ sections: [] })
    expectInvalid(`${atLimit} `)
  })

  it('rejects a string longer than 1 MiB even while the response remains below 2 MiB', () => {
    const source = JSON.stringify({
      sections: [{ RowLevelSecurity: [{ sql: 'x'.repeat((1024 * 1024) + 1) }] }],
    })

    expectInvalid(source)
  })

  it('accepts a string of exactly 1 MiB', () => {
    const source = JSON.stringify({
      sections: [{ RowLevelSecurity: [{ sql: 'x'.repeat(1024 * 1024) }] }],
    })

    expect(parse(source).value.sections).toHaveLength(1)
  })

  it('rejects more than 100,000 aggregate array elements', () => {
    const types = Array.from({ length: 100_001 }, () => ({ U8: [] }))
    expectInvalid(JSON.stringify({ sections: [{ Typespace: { types } }] }))
  })

  it('accepts exactly 100,000 aggregate array elements', () => {
    // One `sections` element plus 99,999 type elements is the aggregate limit.
    const types = Array.from({ length: 99_999 }, () => ({ U8: [] }))
    expect(parse(JSON.stringify({ sections: [{ Typespace: { types } }] })).value.sections).toHaveLength(1)
  })

  it('rejects more than 250,000 JSON value nodes independently of the array budget', () => {
    const types = Array.from({ length: 84_000 }, () => ({ Array: { U8: [] } }))
    expectInvalid(JSON.stringify({ sections: [{ Typespace: { types } }] }))
  })

  it('accepts a document just below the 250,000-node budget', () => {
    const types = Array.from({ length: 83_000 }, () => ({ Array: { U8: [] } }))
    expect(parse(JSON.stringify({ sections: [{ Typespace: { types } }] })).value.sections).toHaveLength(1)
  })

  it('rejects nesting deeper than 64 before recursive validation can exhaust the stack', () => {
    let type: unknown = { U8: [] }
    for (let index = 0; index < 58; index += 1) type = { Array: type }
    expectInvalid(JSON.stringify({ sections: [{ Typespace: { types: [type] } }] }))
  })

  it('accepts nesting at the exact depth-64 boundary', () => {
    let type: unknown = { U8: [] }
    for (let index = 0; index < 57; index += 1) type = { Array: type }
    expect(parse(JSON.stringify({ sections: [{ Typespace: { types: [type] } }] })).value.sections).toHaveLength(1)
  })

  it.each([
    '9007199254740992',
    '-9007199254740992',
    '1.5',
  ])('rejects unsafe or non-integral numeric value %s', number => {
    expectInvalid(`{"sections":[{"Typespace":{"types":[{"Ref":${number}}]}}]}`)
  })

  it('rejects malformed UTF-8 and reports no rejected bytes or parser details', () => {
    let caught: unknown
    try {
      parseAndNormalizeRawModuleDefV10(Uint8Array.of(0xff, 0xfe, 0xfd))
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect(caught).toMatchObject({
      name: 'RawModuleDefV10Error',
      message: RAW_MODULE_DEF_V10_INVALID,
      code: RAW_MODULE_DEF_V10_INVALID,
    })
    expect((caught as Error).stack).toBeUndefined()
    expect(Reflect.ownKeys(caught as object).sort()).toEqual(['code', 'message', 'name'])
  })

  it('rejects a UTF-8 byte-order mark instead of silently changing the input grammar', () => {
    expect(() => parseAndNormalizeRawModuleDefV10(Uint8Array.of(
      0xef, 0xbb, 0xbf, ...encoder.encode('{"sections":[]}'),
    ))).toThrowError(RAW_MODULE_DEF_V10_INVALID)
  })

  it('accepts and deeply freezes a complete server-v10 ABI surface', () => {
    const normalized = parse(JSON.stringify(completeValidModule()))

    expect(normalized.value.sections).toHaveLength(RAW_MODULE_DEF_V10_SECTION_ORDER.length)
    expectDeepFrozen(normalized.value)
    expect(JSON.parse(decoder.decode(normalized.canonicalBytes()))).toEqual(normalized.value)
  })

  it('normalizes object and section order while preserving every ABI array order', () => {
    const first = completeValidModule()
    const second = completeValidModule()
    second.sections.reverse()
    for (const section of second.sections as MutableObject[]) {
      const [tag] = Object.keys(section)
      const payload = section[tag]
      if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
        section[tag] = Object.fromEntries(Object.entries(payload).reverse())
      }
    }

    const canonical = decoder.decode(parse(JSON.stringify(first)).canonicalBytes())
    expect(decoder.decode(parse(JSON.stringify(second)).canonicalBytes())).toBe(canonical)

    const arrayMutation = structuredClone(first)
    getSection<MutableObject[]>(arrayMutation, 'Reducers').reverse()
    expect(decoder.decode(parse(JSON.stringify(arrayMutation)).canonicalBytes())).not.toBe(canonical)
  })

  it.each([
    {
      Sum: {
        variants: [
          field('some', { Ref: 1 }),
          field('none', product([])),
        ],
      },
    },
    product([field('__query__', { Ref: 1 })]),
  ])('accepts each official non-array view return wrapper', returnType => {
    expect(parse(mutateComplete(document => {
      getSection<MutableObject[]>(document, 'Views')[0].return_type = returnType
    })).value.sections).toHaveLength(RAW_MODULE_DEF_V10_SECTION_ORDER.length)
  })

  it('accepts canonical cross-references resolved through explicit names', () => {
    const source = mutateComplete(document => {
      getSection<MutableObject[]>(document, 'Tables')[0].source_name = 'PlayerRecords'
      getSection<MutableObject>(document, 'ExplicitNames').entries[0].Table = {
        source_name: 'PlayerRecords',
        canonical_name: 'players',
      }
      getSection<MutableObject[]>(document, 'Reducers')[0].source_name = 'scheduledTick'
      getSection<MutableObject>(document, 'ExplicitNames').entries.push({
        Function: { source_name: 'scheduledTick', canonical_name: 'scheduled_tick' },
      })
    })

    expect(parse(source).value.sections).toHaveLength(RAW_MODULE_DEF_V10_SECTION_ORDER.length)
  })

  it('keeps ViewPrimaryKeys bound to the view source name, not its canonical name', () => {
    const sourceNamed = mutateComplete(document => {
      getSection<MutableObject[]>(document, 'Views')[0].source_name = 'VisiblePlayers'
      getSection<MutableObject[]>(document, 'ViewPrimaryKeys')[0].view_source_name = 'VisiblePlayers'
      getSection<MutableObject>(document, 'ExplicitNames').entries.push({
        Function: { source_name: 'VisiblePlayers', canonical_name: 'visible_players' },
      })
    })
    expect(parse(sourceNamed).value.sections).toHaveLength(RAW_MODULE_DEF_V10_SECTION_ORDER.length)

    expectInvalid(mutateComplete(document => {
      getSection<MutableObject[]>(document, 'Views')[0].source_name = 'VisiblePlayers'
      getSection<MutableObject[]>(document, 'ViewPrimaryKeys')[0].view_source_name = 'visible_players'
      getSection<MutableObject>(document, 'ExplicitNames').entries.push({
        Function: { source_name: 'VisiblePlayers', canonical_name: 'visible_players' },
      })
    }))
  })

  it('accepts the remaining enum/algorithm alternatives without widening their tagged shapes', () => {
    const source = mutateComplete(document => {
      const table = getSection<MutableObject[]>(document, 'Tables')[0]
      table.table_type = unit('System')
      table.table_access = unit('Public')
      table.indexes[1].algorithm = { Hash: [2] }
      const lifecycles = getSection<MutableObject[]>(document, 'LifeCycleReducers')
      lifecycles[0].lifecycle_spec = unit('OnConnect')
      getSection<MutableObject[]>(document, 'HttpRoutes')[1].method = {
        Method: { Extension: 'CUSTOM' },
      }
    })

    expect(parse(source).value.sections).toHaveLength(RAW_MODULE_DEF_V10_SECTION_ORDER.length)
  })

  it('decodes variable-width BSATN defaults exactly, including trailing-byte rejection', () => {
    const accepted = mutateComplete(document => {
      const typespace = getSection<MutableObject>(document, 'Typespace')
      typespace.types[0].Product.elements[2].algebraic_type = unit('String')
      getSection<MutableObject[]>(document, 'Tables')[0].indexes.splice(1, 1)
      getSection<MutableObject[]>(document, 'Tables')[0].default_values[0].value = '020000006f6b'
    })
    expect(parse(accepted).value.sections).toHaveLength(RAW_MODULE_DEF_V10_SECTION_ORDER.length)

    expectInvalid(mutateComplete(document => {
      const typespace = getSection<MutableObject>(document, 'Typespace')
      typespace.types[0].Product.elements[2].algebraic_type = unit('String')
      getSection<MutableObject[]>(document, 'Tables')[0].indexes.splice(1, 1)
      getSection<MutableObject[]>(document, 'Tables')[0].default_values[0].value = '020000006f6b00'
    }))
  })

  it('matches Rust UTF-8 lexical order for non-BMP default element ordering', () => {
    const accepted = mutateComplete(document => {
      const choice = getSection<MutableObject>(document, 'Typespace').types[2].Sum.variants
      choice[0].name = some('Ａ')
      choice[1].name = some('𐀀')
      getSection<MutableObject[]>(document, 'Types')[2].custom_ordering = false
    })
    expect(parse(accepted).value.sections).toHaveLength(RAW_MODULE_DEF_V10_SECTION_ORDER.length)

    expectInvalid(mutateComplete(document => {
      const choice = getSection<MutableObject>(document, 'Typespace').types[2].Sum.variants
      choice[0].name = some('𐀀')
      choice[1].name = some('Ａ')
      getSection<MutableObject[]>(document, 'Types')[2].custom_ordering = false
    }))
  })

  it('checks default ordering after the v10 SnakeCase/CamelCase name policy', () => {
    expect(parse(mutateComplete(document => {
      const choice = getSection<MutableObject>(document, 'Typespace').types[2].Sum.variants
      choice[0].name = some('a')
      choice[1].name = some('Z')
      getSection<MutableObject[]>(document, 'Types')[2].custom_ordering = false
    })).value.sections).toHaveLength(RAW_MODULE_DEF_V10_SECTION_ORDER.length)

    expectInvalid(mutateComplete(document => {
      const choice = getSection<MutableObject>(document, 'Typespace').types[2].Sum.variants
      choice[0].name = some('Z')
      choice[1].name = some('a')
      getSection<MutableObject[]>(document, 'Types')[2].custom_ordering = false
    }))
  })

  it('accepts NFC identifiers and rejects canonically equivalent decomposed identifiers', () => {
    expect(parse(mutateComplete(document => {
      getSection<MutableObject[]>(document, 'Types')[2].source_name.source_name = 'Åname'
    })).value.sections).toHaveLength(RAW_MODULE_DEF_V10_SECTION_ORDER.length)

    expectInvalid(mutateComplete(document => {
      getSection<MutableObject[]>(document, 'Types')[2].source_name.source_name = 'A\u030Aname'
    }))
  })

  it('uses Unicode XID rather than the broader ID character classes', () => {
    expectInvalid(mutateComplete(document => {
      getSection<MutableObject[]>(document, 'Types')[2].source_name.source_name = '\u037aname'
    }))

    expectInvalid(mutateComplete(document => {
      getSection<MutableObject[]>(document, 'Types')[2].source_name.source_name = 'a\u037a'
    }))
  })

  it('rejects a table field ref to a non-declared Product definition', () => {
    expectInvalid(mutateComplete(document => {
      const types = getSection<MutableObject>(document, 'Typespace').types
      types.push(product([field('value', unit('U16'))]))
      types[0].Product.elements.push(field('zzz_nested', { Ref: 3 }))
    }))
  })

  it('rejects unnamed members in declared Product and Sum definitions', () => {
    expectInvalid(mutateComplete(document => {
      getSection<MutableObject>(document, 'Typespace').types[2].Sum.variants[0].name = none()
    }))

    expectInvalid(mutateComplete(document => {
      const types = getSection<MutableObject>(document, 'Typespace').types
      types.push(product([{ name: none(), algebraic_type: unit('U16') }]))
      getSection<MutableObject[]>(document, 'Types').push({
        source_name: { scope: [], source_name: 'UnnamedProduct' },
        ty: 3,
        custom_ordering: true,
      })
    }))
  })

  it('rejects anonymous ref cycles but permits cycles which pass through a declared definition', () => {
    expectInvalid(mutateComplete(document => {
      const types = getSection<MutableObject>(document, 'Typespace').types
      types.push({ Ref: 4 }, { Array: { Ref: 3 } })
      getSection<MutableObject[]>(document, 'Reducers')[2].params.elements[0].algebraic_type = { Ref: 3 }
    }))

    expect(parse(mutateComplete(document => {
      getSection<MutableObject>(document, 'Typespace').types[0].Product.elements.push(
        field('zzz_parent', { Ref: 0 }),
      )
    })).value.sections).toHaveLength(RAW_MODULE_DEF_V10_SECTION_ORDER.length)
  })

  it('contracts and shares long anonymous ref chains across repeated uses', () => {
    const chainLength = 3_500
    const useCount = 5_000
    const types = Array.from({ length: chainLength }, (_, index) => (
      index + 1 === chainLength ? unit('U64') : { Ref: index + 1 }
    ))
    const params = Array.from({ length: useCount }, (_, index) => field(`p${index}`, { Ref: 0 }))
    const source = JSON.stringify({
      sections: [
        { Typespace: { types } },
        { Types: [] },
        {
          Reducers: [{
            source_name: 'many_uses',
            params: { elements: params },
            visibility: unit('Private'),
            ok_return_type: product([]),
            err_return_type: unit('String'),
          }],
        },
      ],
    })

    const started = performance.now()
    expect(parse(source).value.sections).toHaveLength(3)
    expect(performance.now() - started).toBeLessThan(750)
  }, 10_000)

  it('shares definition and default-order validation across many aliases', () => {
    const fieldCount = 1_000
    const aliasCount = 1_000
    const row = product(Array.from(
      { length: fieldCount },
      (_, index) => field(`f${String(index).padStart(4, '0')}`, unit('U64')),
    ))
    const aliases = Array.from({ length: aliasCount }, (_, index) => ({
      source_name: { scope: [], source_name: `Alias${index}` },
      ty: 0,
      custom_ordering: false,
    }))
    const source = JSON.stringify({ sections: [{ Typespace: { types: [row] } }, { Types: aliases }] })

    const started = performance.now()
    expect(parse(source).value.sections).toHaveLength(2)
    expect(performance.now() - started).toBeLessThan(750)
  }, 10_000)

  it('caches long ref contraction while decoding a maximum-length zero-width BSATN array', () => {
    const chainLength = 75
    const types: MutableObject[] = [product([field('values', { Array: { Ref: 1 } })])]
    for (let index = 1; index <= chainLength; index += 1) {
      types.push(index === chainLength ? product([]) : { Ref: index + 1 })
    }
    const source = JSON.stringify({
      sections: [
        { Typespace: { types } },
        { Types: [{ source_name: { scope: [], source_name: 'Rows' }, ty: 0, custom_ordering: false }] },
        {
          Tables: [{
            source_name: 'rows',
            product_type_ref: 0,
            primary_key: [],
            indexes: [],
            constraints: [],
            sequences: [],
            table_type: unit('User'),
            table_access: unit('Private'),
            default_values: [{ col_id: 0, value: 'a0860100' }],
            is_event: false,
          }],
        },
      ],
    })

    const started = performance.now()
    expect(parse(source).value.sections).toHaveLength(3)
    expect(performance.now() - started).toBeLessThan(750)
  }, 10_000)

  it('permits multiple distinct type names to alias the same declared ref', () => {
    expect(parse(mutateComplete(document => {
      getSection<MutableObject[]>(document, 'Types').push({
        source_name: { scope: [], source_name: 'ChoiceAlias' },
        ty: 2,
        custom_ordering: true,
      })
    })).value.sections).toHaveLength(RAW_MODULE_DEF_V10_SECTION_ORDER.length)
  })

  it.each<[string, (document: MutableObject) => void]>([
    ['table columns', document => {
      getSection<MutableObject>(document, 'Typespace').types[0].Product.elements.push(
        field('zzz_inline', product([field('value', unit('U16'))])),
      )
    }],
    ['reducer parameters', document => {
      getSection<MutableObject[]>(document, 'Reducers')[2].params.elements[0].algebraic_type = product([
        field('value', unit('U16')),
      ])
    }],
    ['procedure parameters', document => {
      getSection<MutableObject[]>(document, 'Procedures')[0].params.elements[0].algebraic_type = product([
        field('value', unit('U16')),
      ])
    }],
    ['procedure returns', document => {
      getSection<MutableObject[]>(document, 'Procedures')[0].return_type = product([
        field('value', unit('U16')),
      ])
    }],
    ['view parameters', document => {
      getSection<MutableObject[]>(document, 'Views')[0].params.elements.push(
        field('inline', product([field('value', unit('U16'))])),
      )
    }],
    ['view returns', document => {
      const typeDefs = getSection<MutableObject[]>(document, 'Types')
      getSection<MutableObject[]>(document, 'Procedures')[0].return_type = unit('U64')
      document.sections.find((section: MutableObject) => Object.hasOwn(section, 'Types')).Types = typeDefs.filter(
        typeDef => typeDef.ty !== 1,
      )
    }],
  ])('rejects non-special Product/Sum type uses across %s', (_label, mutator) => {
    expectInvalid(mutateComplete(mutator))
  })

  it('recurses through Array, Option, and Result uses', () => {
    const inline = product([field('value', unit('U16'))])
    for (const algebraicType of [
      { Array: inline },
      { Sum: { variants: [field('some', inline), field('none', product([]))] } },
      { Sum: { variants: [field('ok', inline), field('err', unit('String'))] } },
    ]) {
      expectInvalid(mutateComplete(document => {
        getSection<MutableObject[]>(document, 'Reducers')[2].params.elements[0].algebraic_type = algebraicType
      }))
    }
  })

  it('accepts every pinned v2.6.1 special Product/Sum use', () => {
    expect(parse(mutateComplete(document => {
      getSection<MutableObject[]>(document, 'Reducers')[2].params.elements = [
        field('option', { Sum: { variants: [field('some', unit('U16')), field('none', product([]))] } }),
        field('result', { Sum: { variants: [field('ok', unit('U16')), field('err', unit('String'))] } }),
        field('identity', product([field('__identity__', unit('U256'))])),
        field('connection_id', product([field('__connection_id__', unit('U128'))])),
        field('uuid', product([field('__uuid__', unit('U128'))])),
        field('timestamp', product([field('__timestamp_micros_since_unix_epoch__', unit('I64'))])),
        field('duration', product([field('__time_duration_micros__', unit('I64'))])),
        field('schedule_at', scheduleAtType()),
      ]
    })).value.sections).toHaveLength(RAW_MODULE_DEF_V10_SECTION_ORDER.length)
  })

  it.each(['BTree', 'Hash'])('accepts pinned v2.6.1 empty %s and Unique column lists', algorithm => {
    expect(parse(mutateComplete(document => {
      const table = getSection<MutableObject[]>(document, 'Tables')[0]
      table.indexes.push({
        source_name: some(`players_empty_idx_${algorithm.toLowerCase()}`),
        accessor_name: none(),
        algorithm: { [algorithm]: [] },
      })
      table.constraints.push({
        source_name: some('players_empty_key'),
        data: { Unique: { columns: [] } },
      })
    })).value.sections).toHaveLength(RAW_MODULE_DEF_V10_SECTION_ORDER.length)
  })

  it('accepts Direct indexing of the empty-Sum Never type', () => {
    expect(parse(mutateComplete(document => {
      getSection<MutableObject>(document, 'Typespace').types[0].Product.elements[2].algebraic_type = {
        Sum: { variants: [] },
      }
      getSection<MutableObject[]>(document, 'Tables')[0].default_values = []
    })).value.sections).toHaveLength(RAW_MODULE_DEF_V10_SECTION_ORDER.length)
  })

  it('requires the schedule-at column to have the direct exact ScheduleAt shape', () => {
    expectInvalid(mutateComplete(document => {
      const types = getSection<MutableObject>(document, 'Typespace').types
      types.push(scheduleAtType())
      types[0].Product.elements[1].algebraic_type = { Ref: 3 }
    }))

    expectInvalid(mutateComplete(document => {
      const types = getSection<MutableObject>(document, 'Typespace').types
      types.push(
        product([field('__time_duration_micros__', unit('I64'))]),
        product([field('__timestamp_micros_since_unix_epoch__', unit('I64'))]),
      )
      const variants = types[0].Product.elements[1].algebraic_type.Sum.variants
      variants[0].algebraic_type = { Ref: 3 }
      variants[1].algebraic_type = { Ref: 4 }
    }))
  })

  it.each<[string, (document: MutableObject) => void]>([
    ['out-of-range Typespace reference', document => {
      getSection<MutableObject>(document, 'Typespace').types[0].Product.elements[0].algebraic_type = { Ref: 99 }
    }],
    ['unknown AlgebraicType tag', document => {
      getSection<MutableObject>(document, 'Typespace').types[0].Product.elements[0].algebraic_type = { Bytes: [] }
    }],
    ['malformed unit AlgebraicType payload', document => {
      getSection<MutableObject>(document, 'Typespace').types[0].Product.elements[0].algebraic_type = { U64: [0] }
    }],
    ['duplicate product column name', document => {
      getSection<MutableObject>(document, 'Typespace').types[0].Product.elements[1].name = some('id')
    }],
    ['invalid product column identifier', document => {
      getSection<MutableObject>(document, 'Typespace').types[0].Product.elements[1].name = some('not valid')
    }],
    ['unnamed table column', document => {
      getSection<MutableObject>(document, 'Typespace').types[0].Product.elements[0].name = none()
    }],
    ['type definition referring to a primitive', document => {
      getSection<MutableObject[]>(document, 'Types')[0].ty = 99
    }],
    ['duplicate scoped type name', document => {
      const types = getSection<MutableObject[]>(document, 'Types')
      types[1].source_name = structuredClone(types[0].source_name)
    }],
    ['duplicate scoped type name after default PascalCase conversion', document => {
      const types = getSection<MutableObject[]>(document, 'Types')
      types[1].source_name = { scope: [], source_name: 'player_row' }
    }],
    ['malformed scoped type source', document => {
      getSection<MutableObject[]>(document, 'Types')[0].source_name.scope = ['not valid']
    }],
    ['wrong type-definition key', document => {
      getSection<MutableObject[]>(document, 'Types')[0].customOrdering = false
    }],
    ['non-default sum ordering without custom ordering', document => {
      getSection<MutableObject[]>(document, 'Types')[2].custom_ordering = false
    }],
  ])('rejects invalid type/column mutation: %s', (_name, mutator) => {
    expectInvalid(mutateComplete(mutator))
  })

  it.each<[string, (document: MutableObject) => void]>([
    ['missing table member', document => {
      delete getSection<MutableObject[]>(document, 'Tables')[0].is_event
    }],
    ['invalid table type', document => {
      getSection<MutableObject[]>(document, 'Tables')[0].table_type = unit('Temporary')
    }],
    ['invalid table access', document => {
      getSection<MutableObject[]>(document, 'Tables')[0].table_access = unit('PubliclyWritable')
    }],
    ['reserved canonical system-table prefix on a user table', document => {
      getSection<MutableObject>(document, 'ExplicitNames').entries[0].Table.canonical_name = 'st_players'
    }],
    ['non-product table reference', document => {
      getSection<MutableObject[]>(document, 'Tables')[0].product_type_ref = 2
    }],
    ['duplicate table name', document => {
      const tables = getSection<MutableObject[]>(document, 'Tables')
      tables.push(structuredClone(tables[0]))
    }],
    ['multi-column primary key', document => {
      getSection<MutableObject[]>(document, 'Tables')[0].primary_key = [0, 2]
    }],
    ['primary key without matching unique constraint', document => {
      getSection<MutableObject[]>(document, 'Tables')[0].constraints = []
    }],
    ['primary key without backing index', document => {
      getSection<MutableObject[]>(document, 'Tables')[0].indexes[0].algorithm = { BTree: [2] }
    }],
    ['out-of-range index column', document => {
      getSection<MutableObject[]>(document, 'Tables')[0].indexes[0].algorithm = { BTree: [9] }
    }],
    ['bad direct-index column type', document => {
      getSection<MutableObject[]>(document, 'Tables')[0].indexes[1].algorithm = { Direct: 1 }
    }],
    ['direct index through a chained type reference', document => {
      const typespace = getSection<MutableObject>(document, 'Typespace')
      typespace.types.push({ Ref: 2 })
      typespace.types[0].Product.elements[2].algebraic_type = { Ref: 3 }
      getSection<MutableObject[]>(document, 'Tables')[0].default_values[0].value = '00'
    }],
    ['missing v10 index source name', document => {
      getSection<MutableObject[]>(document, 'Tables')[0].indexes[0].source_name = none()
    }],
    ['duplicate index source name', document => {
      const indexes = getSection<MutableObject[]>(document, 'Tables')[0].indexes
      indexes[1].source_name = structuredClone(indexes[0].source_name)
    }],
    ['unique constraint without matching index', document => {
      getSection<MutableObject[]>(document, 'Tables')[0].constraints[0].data.Unique.columns = [2]
    }],
    ['sequence on a non-integral column', document => {
      getSection<MutableObject[]>(document, 'Tables')[0].sequences[0].column = 1
    }],
    ['duplicate sequence column', document => {
      const sequences = getSection<MutableObject[]>(document, 'Tables')[0].sequences
      sequences.push(structuredClone(sequences[0]))
    }],
    ['inverted sequence range', document => {
      getSection<MutableObject[]>(document, 'Tables')[0].sequences[0].max_value = some(0)
    }],
    ['out-of-range default column', document => {
      getSection<MutableObject[]>(document, 'Tables')[0].default_values[0].col_id = 9
    }],
    ['non-lowercase default hex', document => {
      getSection<MutableObject[]>(document, 'Tables')[0].default_values[0].value = '2A00'
    }],
    ['malformed BSATN default bytes', document => {
      getSection<MutableObject[]>(document, 'Tables')[0].default_values[0].value = '25'
    }],
  ])('rejects invalid table/index/constraint/sequence/default mutation: %s', (_name, mutator) => {
    expectInvalid(mutateComplete(mutator))
  })

  it.each<[string, (document: MutableObject) => void]>([
    ['unnamed reducer parameter', document => {
      getSection<MutableObject[]>(document, 'Reducers')[0].params.elements[0].name = none()
    }],
    ['duplicate reducer name', document => {
      const reducers = getSection<MutableObject[]>(document, 'Reducers')
      reducers[1].source_name = reducers[0].source_name
    }],
    ['wrong reducer visibility', document => {
      getSection<MutableObject[]>(document, 'Reducers')[0].visibility = unit('Public')
    }],
    ['non-unit reducer success return', document => {
      getSection<MutableObject[]>(document, 'Reducers')[0].ok_return_type = unit('Bool')
    }],
    ['non-string reducer error return', document => {
      getSection<MutableObject[]>(document, 'Reducers')[0].err_return_type = unit('U8')
    }],
    ['procedure name colliding with reducer', document => {
      getSection<MutableObject[]>(document, 'Procedures')[0].source_name = 'set_score'
    }],
    ['invalid procedure return ref', document => {
      getSection<MutableObject[]>(document, 'Procedures')[0].return_type = { Ref: 99 }
    }],
    ['extra procedure field', document => {
      getSection<MutableObject[]>(document, 'Procedures')[0].extra = false
    }],
  ])('rejects invalid reducer/procedure mutation: %s', (_name, mutator) => {
    expectInvalid(mutateComplete(mutator))
  })

  it.each<[string, (document: MutableObject) => void]>([
    ['direct-ref view return', document => {
      getSection<MutableObject[]>(document, 'Views')[0].return_type = { Ref: 1 }
    }],
    ['view returning a non-product ref', document => {
      getSection<MutableObject[]>(document, 'Views')[0].return_type = { Array: { Ref: 2 } }
    }],
    ['duplicate view function name', document => {
      getSection<MutableObject[]>(document, 'Views')[0].source_name = 'lookup_player'
    }],
    ['duplicate view index in one calling context', document => {
      const views = getSection<MutableObject[]>(document, 'Views')
      views.push({ ...structuredClone(views[0]), source_name: 'other_view' })
    }],
    ['unknown view-primary-key view', document => {
      getSection<MutableObject[]>(document, 'ViewPrimaryKeys')[0].view_source_name = 'missing_view'
    }],
    ['unknown view-primary-key column', document => {
      getSection<MutableObject[]>(document, 'ViewPrimaryKeys')[0].columns = ['missing_column']
    }],
    ['multi-column view primary key', document => {
      getSection<MutableObject[]>(document, 'ViewPrimaryKeys')[0].columns = ['id', 'label']
    }],
    ['repeated view-primary-key declaration', document => {
      const keys = getSection<MutableObject[]>(document, 'ViewPrimaryKeys')
      keys.push(structuredClone(keys[0]))
    }],
  ])('rejects invalid view mutation: %s', (_name, mutator) => {
    expectInvalid(mutateComplete(mutator))
  })

  it.each<[string, (document: MutableObject) => void]>([
    ['missing schedule table', document => {
      getSection<MutableObject[]>(document, 'Schedules')[0].table_name = 'missing_table'
    }],
    ['wrong schedule-at column type', document => {
      getSection<MutableObject[]>(document, 'Schedules')[0].schedule_at_col = 2
    }],
    ['missing scheduled function', document => {
      getSection<MutableObject[]>(document, 'Schedules')[0].function_name = 'missing_function'
    }],
    ['wrong scheduled function signature', document => {
      getSection<MutableObject[]>(document, 'Schedules')[0].function_name = 'set_score'
    }],
    ['second schedule for one table', document => {
      const schedules = getSection<MutableObject[]>(document, 'Schedules')
      schedules.push({ ...structuredClone(schedules[0]), source_name: some('other_schedule') })
    }],
    ['unknown lifecycle reducer', document => {
      getSection<MutableObject[]>(document, 'LifeCycleReducers')[0].function_name = 'missing_reducer'
    }],
    ['duplicate lifecycle assignment', document => {
      const lifecycles = getSection<MutableObject[]>(document, 'LifeCycleReducers')
      lifecycles.push({ lifecycle_spec: unit('Init'), function_name: 'scheduled_tick' })
    }],
    ['second lifecycle on one reducer', document => {
      getSection<MutableObject[]>(document, 'LifeCycleReducers').push({
        lifecycle_spec: unit('OnConnect'),
        function_name: 'init',
      })
    }],
  ])('rejects invalid schedule/lifecycle mutation: %s', (_name, mutator) => {
    expectInvalid(mutateComplete(mutator))
  })

  it.each<[string, (document: MutableObject) => void]>([
    ['duplicate HTTP handler', document => {
      getSection<MutableObject[]>(document, 'HttpHandlers').push({ source_name: 'health' })
    }],
    ['route to missing handler', document => {
      getSection<MutableObject[]>(document, 'HttpRoutes')[0].handler_function = 'missing_handler'
    }],
    ['invalid route path', document => {
      getSection<MutableObject[]>(document, 'HttpRoutes')[0].path = 'Health'
    }],
    ['unknown HTTP method', document => {
      getSection<MutableObject[]>(document, 'HttpRoutes')[1].method = { Method: unit('Fetch') }
    }],
    ['malformed extension method', document => {
      getSection<MutableObject[]>(document, 'HttpRoutes')[1].method = { Method: { Extension: 7 } }
    }],
    ['overlap with Any route', document => {
      getSection<MutableObject[]>(document, 'HttpRoutes').push({
        handler_function: 'health',
        method: { Method: unit('Post') },
        path: '/health',
      })
    }],
    ['duplicate exact HTTP route', document => {
      const routes = getSection<MutableObject[]>(document, 'HttpRoutes')
      routes.push(structuredClone(routes[1]))
    }],
  ])('rejects invalid HTTP mutation: %s', (_name, mutator) => {
    expectInvalid(mutateComplete(mutator))
  })

  it.each<[string, (document: MutableObject) => void]>([
    ['non-string RLS SQL', document => {
      getSection<MutableObject[]>(document, 'RowLevelSecurity')[0].sql = 7
    }],
    ['extra RLS field', document => {
      getSection<MutableObject[]>(document, 'RowLevelSecurity')[0].enabled = true
    }],
    ['unknown explicit-name entry tag', document => {
      getSection<MutableObject>(document, 'ExplicitNames').entries[0] = {
        Constraint: { source_name: 'players', canonical_name: 'players' },
      }
    }],
    ['explicit table source does not resolve', document => {
      getSection<MutableObject>(document, 'ExplicitNames').entries[0].Table.source_name = 'missing'
    }],
    ['explicit function source does not resolve', document => {
      getSection<MutableObject>(document, 'ExplicitNames').entries[1].Function.source_name = 'missing'
    }],
    ['explicit index source does not resolve', document => {
      getSection<MutableObject>(document, 'ExplicitNames').entries[2].Index.source_name = 'missing'
    }],
    ['invalid explicit canonical name', document => {
      getSection<MutableObject>(document, 'ExplicitNames').entries[0].Table.canonical_name = 'not valid'
    }],
    ['duplicate explicit mapping', document => {
      const entries = getSection<MutableObject>(document, 'ExplicitNames').entries
      entries.push(structuredClone(entries[0]))
    }],
  ])('rejects invalid RLS/explicit-naming mutation: %s', (_name, mutator) => {
    expectInvalid(mutateComplete(mutator))
  })
})
