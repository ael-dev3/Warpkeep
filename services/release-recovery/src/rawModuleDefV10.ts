import type { JsonObject, JsonValue } from './protocol.js'

export const RAW_MODULE_DEF_V10_SECTION_ORDER = Object.freeze([
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
] as const)

export type RawModuleDefV10SectionTag = (typeof RAW_MODULE_DEF_V10_SECTION_ORDER)[number]

export const RAW_MODULE_DEF_V10_MAX_BYTES = 2 * 1024 * 1024
export const RAW_MODULE_DEF_V10_MAX_DEPTH = 64
export const RAW_MODULE_DEF_V10_MAX_NODES = 250_000
export const RAW_MODULE_DEF_V10_MAX_ARRAY_ELEMENTS = 100_000
export const RAW_MODULE_DEF_V10_MAX_STRING_BYTES = 1024 * 1024
export const RAW_MODULE_DEF_V10_INVALID = 'RECOVERY_RAW_MODULE_DEF_V10_INVALID'

const SECTION_TAGS = new Set<string>(RAW_MODULE_DEF_V10_SECTION_ORDER)
const JSON_WHITESPACE = new Set([' ', '\t', '\n', '\r'])
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

export class RawModuleDefV10Error extends Error {
  readonly code = RAW_MODULE_DEF_V10_INVALID

  constructor() {
    super(RAW_MODULE_DEF_V10_INVALID)
    this.name = 'RawModuleDefV10Error'
    delete this.stack
  }
}

export type RawModuleDefV10Value = Readonly<{
  sections: readonly Readonly<Record<string, JsonValue>>[]
}>

export type NormalizedRawModuleDefV10 = Readonly<{
  value: RawModuleDefV10Value
  canonicalBytes: () => Uint8Array
}>

function fail(): never {
  throw new RawModuleDefV10Error()
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) return true
      index += 1
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true
    }
  }
  return false
}

class BoundedStrictJsonParser {
  #index = 0
  #nodes = 0
  #arrayElements = 0
  readonly #numberPattern = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/uy

  constructor(private readonly source: string) {}

  parseDocument(): JsonValue {
    this.skipWhitespace()
    const value = this.parseValue(1)
    this.skipWhitespace()
    if (this.#index !== this.source.length) fail()
    return value
  }

  private parseValue(depth: number): JsonValue {
    if (depth > RAW_MODULE_DEF_V10_MAX_DEPTH) fail()
    this.#nodes += 1
    if (this.#nodes > RAW_MODULE_DEF_V10_MAX_NODES) fail()

    this.skipWhitespace()
    const character = this.source[this.#index]
    if (character === '{') return this.parseObject(depth)
    if (character === '[') return this.parseArray(depth)
    if (character === '"') return this.parseString()
    if (this.consume('true')) return true
    if (this.consume('false')) return false
    if (this.consume('null')) return null
    return this.parseNumber()
  }

  private parseObject(depth: number): JsonObject {
    this.#index += 1
    this.skipWhitespace()
    const result: Record<string, JsonValue> = Object.create(null)
    if (this.source[this.#index] === '}') {
      this.#index += 1
      return result
    }

    while (true) {
      if (this.source[this.#index] !== '"') fail()
      const key = this.parseString()
      if (Object.hasOwn(result, key)) fail()
      this.skipWhitespace()
      if (this.source[this.#index] !== ':') fail()
      this.#index += 1
      result[key] = this.parseValue(depth + 1)
      this.skipWhitespace()
      const separator = this.source[this.#index]
      if (separator === '}') {
        this.#index += 1
        return result
      }
      if (separator !== ',') fail()
      this.#index += 1
      this.skipWhitespace()
    }
  }

  private parseArray(depth: number): readonly JsonValue[] {
    this.#index += 1
    this.skipWhitespace()
    const result: JsonValue[] = []
    if (this.source[this.#index] === ']') {
      this.#index += 1
      return result
    }

    while (true) {
      this.#arrayElements += 1
      if (this.#arrayElements > RAW_MODULE_DEF_V10_MAX_ARRAY_ELEMENTS) fail()
      result.push(this.parseValue(depth + 1))
      this.skipWhitespace()
      const separator = this.source[this.#index]
      if (separator === ']') {
        this.#index += 1
        return result
      }
      if (separator !== ',') fail()
      this.#index += 1
      this.skipWhitespace()
    }
  }

  private parseString(): string {
    this.#index += 1
    let result = ''
    let segmentStart = this.#index

    while (this.#index < this.source.length) {
      const character = this.source[this.#index]
      if (character === '"') {
        result += this.source.slice(segmentStart, this.#index)
        this.#index += 1
        if (
          hasUnpairedSurrogate(result)
          || encoder.encode(result).byteLength > RAW_MODULE_DEF_V10_MAX_STRING_BYTES
        ) {
          fail()
        }
        return result
      }
      if (character === '\\') {
        result += this.source.slice(segmentStart, this.#index)
        this.#index += 1
        const escaped = this.source[this.#index]
        this.#index += 1
        if (escaped === '"' || escaped === '\\' || escaped === '/') {
          result += escaped
        } else if (escaped === 'b') {
          result += '\b'
        } else if (escaped === 'f') {
          result += '\f'
        } else if (escaped === 'n') {
          result += '\n'
        } else if (escaped === 'r') {
          result += '\r'
        } else if (escaped === 't') {
          result += '\t'
        } else if (escaped === 'u') {
          const hex = this.source.slice(this.#index, this.#index + 4)
          if (!/^[0-9a-fA-F]{4}$/u.test(hex)) fail()
          result += String.fromCharCode(Number.parseInt(hex, 16))
          this.#index += 4
        } else {
          fail()
        }
        segmentStart = this.#index
        continue
      }
      if (character === undefined || character < ' ') fail()
      this.#index += 1
    }
    fail()
  }

  private parseNumber(): number {
    this.#numberPattern.lastIndex = this.#index
    const match = this.#numberPattern.exec(this.source)
    if (match === null) fail()
    this.#index = this.#numberPattern.lastIndex
    const next = this.source[this.#index]
    if (
      next !== undefined
      && next !== ','
      && next !== ']'
      && next !== '}'
      && !JSON_WHITESPACE.has(next)
    ) {
      fail()
    }
    const value = Number(match[0])
    if (!Number.isSafeInteger(value)) fail()
    return value
  }

  private skipWhitespace(): void {
    while (JSON_WHITESPACE.has(this.source[this.#index] ?? '')) this.#index += 1
  }

  private consume(value: string): boolean {
    if (this.source.slice(this.#index, this.#index + value.length) !== value) return false
    this.#index += value.length
    return true
  }
}

function isObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireExactObject(value: JsonValue, expectedKeys: readonly string[]): JsonObject {
  if (!isObject(value)) fail()
  const keys = Object.keys(value)
  if (keys.length !== expectedKeys.length || expectedKeys.some(key => !Object.hasOwn(value, key))) fail()
  return value
}

function requireArray(value: JsonValue): readonly JsonValue[] {
  if (!Array.isArray(value)) fail()
  return value
}

function requireString(value: JsonValue): string {
  if (typeof value !== 'string') fail()
  return value
}

function requireBoolean(value: JsonValue): boolean {
  if (typeof value !== 'boolean') fail()
  return value
}

function requireUint(value: JsonValue, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum) fail()
  return value as number
}

function requireInteger(value: JsonValue): number {
  if (!Number.isSafeInteger(value)) fail()
  return value as number
}

function tagged(value: JsonValue): readonly [string, JsonValue] {
  if (!isObject(value)) fail()
  const keys = Object.keys(value)
  if (keys.length !== 1 || keys[0] === undefined) fail()
  return [keys[0], value[keys[0]]]
}

function requireUnitVariant(value: JsonValue, allowed: ReadonlySet<string>): string {
  const [tag, payload] = tagged(value)
  if (!allowed.has(tag) || !Array.isArray(payload) || payload.length !== 0) fail()
  return tag
}

function requireIdentifier(value: JsonValue): string {
  const identifier = requireString(value)
  if (identifier.length === 0 || identifier.normalize('NFC') !== identifier) fail()
  const characters = [...identifier]
  if (!/^(?:\p{XID_Start}|_)$/u.test(characters[0] ?? '')) fail()
  if (characters.slice(1).some(character => !/^\p{XID_Continue}$/u.test(character))) fail()
  return identifier
}

function readOption<T>(value: JsonValue, readSome: (some: JsonValue) => T): T | undefined {
  const [tag, payload] = tagged(value)
  if (tag === 'some') return readSome(payload)
  if (tag === 'none' && Array.isArray(payload) && payload.length === 0) return undefined
  fail()
}

function readOptionalIdentifier(value: JsonValue): string | undefined {
  return readOption(value, requireIdentifier)
}

const PRIMITIVE_TAGS = new Set([
  'String', 'Bool', 'I8', 'U8', 'I16', 'U16', 'I32', 'U32', 'I64', 'U64',
  'I128', 'U128', 'I256', 'U256', 'F32', 'F64',
])
const INTEGER_TAGS = new Set([
  'I8', 'U8', 'I16', 'U16', 'I32', 'U32', 'I64', 'U64', 'I128', 'U128', 'I256', 'U256',
])
const DIRECT_INDEX_TAGS = new Set(['U8', 'U16', 'U32', 'U64'])
const TABLE_TYPE_TAGS = new Set(['System', 'User'])
const TABLE_ACCESS_TAGS = new Set(['Public', 'Private'])
const VISIBILITY_TAGS = new Set(['Private', 'ClientCallable'])
const LIFECYCLE_TAGS = new Set(['Init', 'OnConnect', 'OnDisconnect'])
const HTTP_METHOD_TAGS = new Set([
  'Get', 'Head', 'Post', 'Put', 'Delete', 'Connect', 'Options', 'Trace', 'Patch',
])

function validateNamedElements(
  value: JsonValue,
  member: 'elements' | 'variants',
  typespace: readonly JsonValue[] | undefined,
  requireNames: boolean,
): readonly JsonObject[] {
  const container = requireExactObject(value, [member])
  const result: JsonObject[] = []
  const names = new Set<string>()
  for (const entry of requireArray(container[member])) {
    const record = requireExactObject(entry, ['name', 'algebraic_type'])
    const name = readOptionalIdentifier(record.name)
    if (requireNames && name === undefined) fail()
    if (name !== undefined) addUnique(names, name)
    validateAlgebraicType(record.algebraic_type, typespace)
    result.push(record)
  }
  return result
}

function validateProductType(
  value: JsonValue,
  typespace: readonly JsonValue[] | undefined,
  requireNames = false,
): readonly JsonObject[] {
  return validateNamedElements(value, 'elements', typespace, requireNames)
}

function validateSumType(
  value: JsonValue,
  typespace: readonly JsonValue[] | undefined,
  requireNames = false,
): readonly JsonObject[] {
  return validateNamedElements(value, 'variants', typespace, requireNames)
}

function validateAlgebraicType(value: JsonValue, typespace?: readonly JsonValue[]): void {
  const [tag, payload] = tagged(value)
  if (tag === 'Ref') {
    const ref = requireUint(payload, 0xffff_ffff)
    if (typespace !== undefined && ref >= typespace.length) fail()
    return
  }
  if (tag === 'Array') {
    validateAlgebraicType(payload, typespace)
    return
  }
  if (tag === 'Product') {
    validateProductType(payload, typespace)
    return
  }
  if (tag === 'Sum') {
    validateSumType(payload, typespace)
    return
  }
  if (!PRIMITIVE_TAGS.has(tag) || !Array.isArray(payload) || payload.length !== 0) fail()
}

function typeTag(value: JsonValue): string {
  return tagged(value)[0]
}

function typeRef(value: JsonValue): number | undefined {
  const [tag, payload] = tagged(value)
  return tag === 'Ref' ? requireUint(payload, 0xffff_ffff) : undefined
}

function dereferenceType(
  value: JsonValue,
  typespace: readonly JsonValue[],
  resolvedRefs: Map<number, JsonValue>,
): JsonValue {
  let current = value
  const path: number[] = []
  const seen = new Set<number>()
  while (typeTag(current) === 'Ref') {
    const ref = typeRef(current)
    if (ref === undefined || ref >= typespace.length || seen.has(ref)) fail()
    const cached = resolvedRefs.get(ref)
    if (cached !== undefined) {
      current = cached
      break
    }
    seen.add(ref)
    path.push(ref)
    current = typespace[ref]
    if (current === undefined) fail()
  }
  for (const ref of path) resolvedRefs.set(ref, current)
  return current
}

function productElements(
  value: JsonValue,
  typespace: readonly JsonValue[],
  resolvedRefs: Map<number, JsonValue>,
): readonly JsonObject[] {
  const concrete = dereferenceType(value, typespace, resolvedRefs)
  const [tag, payload] = tagged(concrete)
  if (tag !== 'Product') fail()
  return validateProductType(payload, typespace)
}

function optionName(record: JsonObject): string | undefined {
  return readOptionalIdentifier(record.name)
}

function isUnitType(value: JsonValue): boolean {
  const [tag, payload] = tagged(value)
  if (tag !== 'Product') return false
  const product = requireExactObject(payload, ['elements'])
  return requireArray(product.elements).length === 0
}

function isStringType(value: JsonValue): boolean {
  const [tag, payload] = tagged(value)
  return tag === 'String' && Array.isArray(payload) && payload.length === 0
}

function isSimpleEnum(
  value: JsonValue,
  typespace: readonly JsonValue[],
  resolvedRefs: Map<number, JsonValue>,
): boolean {
  const concrete = dereferenceType(value, typespace, resolvedRefs)
  const [tag, payload] = tagged(concrete)
  if (tag !== 'Sum') return false
  const variants = validateSumType(payload, typespace, true)
  return variants.every(variant => isUnitType(variant.algebraic_type))
}

function isIntegerType(value: JsonValue): boolean {
  return INTEGER_TAGS.has(typeTag(value))
}

function isDirectIndexType(
  value: JsonValue,
  typespace: readonly JsonValue[],
  resolvedRefs: Map<number, JsonValue>,
): boolean {
  const [tag, payload] = tagged(value)
  if (DIRECT_INDEX_TAGS.has(tag)) return true
  if (tag === 'Sum') return isSimpleEnum(value, typespace, resolvedRefs)
  if (tag !== 'Ref') return false
  const ref = requireUint(payload, 0xffff_ffff)
  const referred = typespace[ref]
  return referred !== undefined
    && typeTag(referred) === 'Sum'
    && isSimpleEnum(referred, typespace, resolvedRefs)
}

function isExactSpecialProduct(value: JsonValue, marker: string, primitive: string): boolean {
  const [tag, payload] = tagged(value)
  if (tag !== 'Product') return false
  const elements = validateProductType(payload, undefined, true)
  return elements.length === 1
    && optionName(elements[0]) === marker
    && typeTag(elements[0].algebraic_type) === primitive
}

function isPinnedSpecialProduct(value: JsonValue): boolean {
  return isExactSpecialProduct(value, '__identity__', 'U256')
    || isExactSpecialProduct(value, '__connection_id__', 'U128')
    || isExactSpecialProduct(value, '__timestamp_micros_since_unix_epoch__', 'I64')
    || isExactSpecialProduct(value, '__time_duration_micros__', 'I64')
    || isExactSpecialProduct(value, '__uuid__', 'U128')
}

function pinnedSpecialSumUses(value: JsonValue): readonly JsonValue[] | undefined {
  const [tag, payload] = tagged(value)
  if (tag !== 'Sum') return undefined
  const variants = validateSumType(payload, undefined, true)
  if (
    variants.length === 2
    && optionName(variants[0]) === 'some'
    && optionName(variants[1]) === 'none'
    && isUnitType(variants[1].algebraic_type)
  ) {
    return [variants[0].algebraic_type]
  }
  if (
    variants.length === 2
    && optionName(variants[0]) === 'ok'
    && optionName(variants[1]) === 'err'
  ) {
    return [variants[0].algebraic_type, variants[1].algebraic_type]
  }
  if (
    variants.length === 2
    && optionName(variants[0]) === 'Interval'
    && isExactSpecialProduct(variants[0].algebraic_type, '__time_duration_micros__', 'I64')
    && optionName(variants[1]) === 'Time'
    && isExactSpecialProduct(variants[1].algebraic_type, '__timestamp_micros_since_unix_epoch__', 'I64')
  ) {
    return []
  }
  return undefined
}

type TypeUseContext = Readonly<{
  typespace: readonly JsonValue[]
  definitions: ReadonlySet<number>
  validatedUseRefs: Set<number>
  validatedDefinitions: Set<number>
}>

type TypeUseFrame = Readonly<
  { kind: 'value', value: JsonValue }
  | { kind: 'finish-ref', ref: number }
>

function validateTypeUse(value: JsonValue, context: TypeUseContext): void {
  const stack: TypeUseFrame[] = [{ kind: 'value', value }]
  const touching = new Set<number>()

  while (stack.length > 0) {
    const frame = stack.pop() ?? fail()
    if (frame.kind === 'finish-ref') {
      touching.delete(frame.ref)
      context.validatedUseRefs.add(frame.ref)
      continue
    }

    const [tag, payload] = tagged(frame.value)
    if (PRIMITIVE_TAGS.has(tag)) {
      if (!Array.isArray(payload) || payload.length !== 0) fail()
      continue
    }
    if (tag === 'Array') {
      stack.push({ kind: 'value', value: payload })
      continue
    }
    if (tag === 'Ref') {
      const ref = requireUint(payload, 0xffff_ffff)
      if (ref >= context.typespace.length) fail()
      if (context.definitions.has(ref) || context.validatedUseRefs.has(ref)) continue
      if (touching.has(ref)) fail()
      touching.add(ref)
      stack.push({ kind: 'finish-ref', ref })
      stack.push({ kind: 'value', value: context.typespace[ref] ?? fail() })
      continue
    }
    if (tag === 'Product') {
      const elements = validateProductType(payload, context.typespace)
      if (elements.length === 0 || isPinnedSpecialProduct(frame.value)) continue
      fail()
    }
    if (tag === 'Sum') {
      const variants = validateSumType(payload, context.typespace)
      if (variants.length === 0) continue
      const uses = pinnedSpecialSumUses(frame.value)
      if (uses === undefined) fail()
      for (let index = uses.length - 1; index >= 0; index -= 1) {
        stack.push({ kind: 'value', value: uses[index] ?? fail() })
      }
      continue
    }
    fail()
  }
}

function validateTypeDefinition(ref: number, context: TypeUseContext): void {
  if (context.validatedDefinitions.has(ref)) return
  const value = context.typespace[ref] ?? fail()
  const [tag, payload] = tagged(value)
  if (tag === 'Product') {
    if (isPinnedSpecialProduct(value)) fail()
    for (const element of validateProductType(payload, context.typespace, true)) {
      validateTypeUse(element.algebraic_type, context)
    }
    context.validatedDefinitions.add(ref)
    return
  }
  if (tag === 'Sum') {
    if (pinnedSpecialSumUses(value) !== undefined) fail()
    for (const variant of validateSumType(payload, context.typespace, true)) {
      validateTypeUse(variant.algebraic_type, context)
    }
    context.validatedDefinitions.add(ref)
    return
  }
  fail()
}

function isScheduleAtType(value: JsonValue): boolean {
  const [tag, payload] = tagged(value)
  if (tag !== 'Sum') return false
  const variants = validateSumType(payload, undefined, true)
  return variants.length === 2
    && optionName(variants[0]) === 'Interval'
    && isExactSpecialProduct(variants[0].algebraic_type, '__time_duration_micros__', 'I64')
    && optionName(variants[1]) === 'Time'
    && isExactSpecialProduct(variants[1].algebraic_type, '__timestamp_micros_since_unix_epoch__', 'I64')
}

type ExplicitNameKind = 'Table' | 'Function' | 'Index'
type ExplicitNameMaps = Readonly<Record<ExplicitNameKind, ReadonlyMap<string, string>>>

function parseExplicitNames(payload: JsonValue | undefined): ExplicitNameMaps {
  const mutable: Record<ExplicitNameKind, Map<string, string>> = {
    Table: new Map(),
    Function: new Map(),
    Index: new Map(),
  }
  if (payload !== undefined) {
    const names = requireExactObject(payload, ['entries'])
    for (const entry of requireArray(names.entries)) {
      const [kind, mappingValue] = tagged(entry)
      if (kind !== 'Table' && kind !== 'Function' && kind !== 'Index') fail()
      const mapping = requireExactObject(mappingValue, ['source_name', 'canonical_name'])
      const source = requireIdentifier(mapping.source_name)
      const canonical = requireIdentifier(mapping.canonical_name)
      const map = mutable[kind]
      if (map.has(source)) fail()
      map.set(source, canonical)
    }
  }
  return mutable
}

function snakeCase(value: string): string {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
    .replace(/[-\s]+/gu, '_')
    .toLowerCase()
}

function pascalCase(value: string): string {
  return snakeCase(value)
    .split('_')
    .filter(part => part.length > 0)
    .map(part => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join('')
}

function camelCase(value: string): string {
  const pascal = pascalCase(value)
  return `${pascal[0]?.toLowerCase() ?? ''}${pascal.slice(1)}`
}

function canonicalName(kind: ExplicitNameKind, source: string, maps: ExplicitNameMaps): string {
  const canonical = maps[kind].get(source) ?? snakeCase(source)
  return requireIdentifier(canonical)
}

function addUnique<T>(set: Set<T>, value: T): void {
  if (set.has(value)) fail()
  set.add(value)
}

function addGlobalName(set: Set<string>, source: string, canonical: string): void {
  addUnique(set, source)
  if (canonical !== source) addUnique(set, canonical)
}

function columnSetKey(columns: readonly number[]): string {
  return [...columns].sort((left, right) => left - right).join(',')
}

function compareUtf8(left: string, right: string): number {
  const a = encoder.encode(left)
  const b = encoder.encode(right)
  const length = Math.min(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) return (a[index] ?? 0) - (b[index] ?? 0)
  }
  return a.length - b.length
}

function hasDefaultElementOrdering(value: JsonValue, typespace: readonly JsonValue[]): boolean {
  const [tag, payload] = tagged(value)
  const elements = tag === 'Product'
    ? validateProductType(payload, typespace)
    : tag === 'Sum'
      ? validateSumType(payload, typespace)
      : fail()
  let sawNamed = false
  let previousName: string | undefined
  for (const element of elements) {
    const sourceName = optionName(element)
    if (sourceName === undefined) {
      if (sawNamed) return false
      continue
    }
    const name = requireIdentifier(tag === 'Product' ? snakeCase(sourceName) : camelCase(sourceName))
    sawNamed = true
    if (previousName !== undefined && compareUtf8(previousName, name) > 0) return false
    previousName = name
  }
  return true
}

function readColumnList(value: JsonValue, columnCount: number, allowEmpty: boolean): readonly number[] {
  const columns = requireArray(value).map(column => requireUint(column, 0xffff))
  if ((!allowEmpty && columns.length === 0) || columns.some(column => column >= columnCount)) fail()
  if (new Set(columns).size !== columns.length) fail()
  return columns
}

type TableInfo = Readonly<{
  source: string
  canonical: string
  productTypeRef: number
  columns: readonly JsonObject[]
  primaryKey: readonly number[]
}>

type FunctionInfo = Readonly<{
  source: string
  canonical: string
  params: readonly JsonObject[]
}>

function readU32Le(bytes: Uint8Array, state: { offset: number }): number {
  if (state.offset + 4 > bytes.length) fail()
  const result = bytes[state.offset]
    + (bytes[state.offset + 1] * 0x100)
    + (bytes[state.offset + 2] * 0x1_0000)
    + (bytes[state.offset + 3] * 0x100_0000)
  state.offset += 4
  return result >>> 0
}

function consumeBytes(bytes: Uint8Array, state: { offset: number }, count: number): Uint8Array {
  if (!Number.isSafeInteger(count) || count < 0 || state.offset + count > bytes.length) fail()
  const result = bytes.subarray(state.offset, state.offset + count)
  state.offset += count
  return result
}

function validateBsatnBytes(
  hex: string,
  type: JsonValue,
  typespace: readonly JsonValue[],
  resolvedRefs: Map<number, JsonValue>,
): void {
  if (!/^(?:[0-9a-f]{2})*$/u.test(hex)) fail()
  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, (index * 2) + 2), 16)
  }
  const state = { offset: 0, nodes: 0, arrayElements: 0 }

  const read = (rawType: JsonValue, depth: number): void => {
    if (depth > RAW_MODULE_DEF_V10_MAX_DEPTH || ++state.nodes > RAW_MODULE_DEF_V10_MAX_NODES) fail()
    const concrete = dereferenceType(rawType, typespace, resolvedRefs)
    const [tag, payload] = tagged(concrete)
    if (tag === 'Product') {
      for (const element of validateProductType(payload, typespace)) read(element.algebraic_type, depth + 1)
      return
    }
    if (tag === 'Sum') {
      const variants = validateSumType(payload, typespace)
      const variant = consumeBytes(bytes, state, 1)[0]
      if (variant === undefined || variant >= variants.length) fail()
      read(variants[variant].algebraic_type, depth + 1)
      return
    }
    if (tag === 'Array' || tag === 'String') {
      const length = readU32Le(bytes, state)
      if (tag === 'String') {
        try {
          decoder.decode(consumeBytes(bytes, state, length))
        } catch {
          fail()
        }
        return
      }
      state.arrayElements += length
      if (state.arrayElements > RAW_MODULE_DEF_V10_MAX_ARRAY_ELEMENTS) fail()
      for (let index = 0; index < length; index += 1) read(payload, depth + 1)
      return
    }
    const widths: Readonly<Record<string, number>> = {
      Bool: 1,
      I8: 1,
      U8: 1,
      I16: 2,
      U16: 2,
      I32: 4,
      U32: 4,
      I64: 8,
      U64: 8,
      I128: 16,
      U128: 16,
      I256: 32,
      U256: 32,
      F32: 4,
      F64: 8,
    }
    const width = widths[tag]
    if (width === undefined) fail()
    const primitive = consumeBytes(bytes, state, width)
    if (tag === 'Bool' && primitive[0] !== 0 && primitive[0] !== 1) fail()
  }

  read(type, 1)
  if (state.offset !== bytes.length) fail()
}

function extractViewReturnRef(value: JsonValue): number {
  const [tag, payload] = tagged(value)
  if (tag === 'Array') {
    const ref = typeRef(payload)
    if (ref === undefined) fail()
    return ref
  }
  if (tag === 'Sum') {
    const variants = validateSumType(payload, undefined, true)
    if (
      variants.length !== 2
      || optionName(variants[0]) !== 'some'
      || optionName(variants[1]) !== 'none'
      || !isUnitType(variants[1].algebraic_type)
    ) {
      fail()
    }
    const ref = typeRef(variants[0].algebraic_type)
    if (ref === undefined) fail()
    return ref
  }
  if (tag === 'Product') {
    const elements = validateProductType(payload, undefined, true)
    if (elements.length !== 1 || optionName(elements[0]) !== '__query__') fail()
    const ref = typeRef(elements[0].algebraic_type)
    if (ref === undefined) fail()
    return ref
  }
  fail()
}

function validateModule(sections: ReadonlyMap<RawModuleDefV10SectionTag, JsonValue>): void {
  const typespacePayload = sections.get('Typespace')
  const typespace = typespacePayload === undefined
    ? []
    : requireArray(requireExactObject(typespacePayload, ['types']).types)
  for (const type of typespace) validateAlgebraicType(type, typespace)

  const explicitNames = parseExplicitNames(sections.get('ExplicitNames'))
  const rawTypeDefs = requireArray(sections.get('Types') ?? [])
  const declaredTypeRefs = new Set<number>()
  for (const rawTypeDef of rawTypeDefs) {
    const typeDef = requireExactObject(rawTypeDef, ['source_name', 'ty', 'custom_ordering'])
    declaredTypeRefs.add(requireUint(typeDef.ty, 0xffff_ffff))
  }
  const typeUseContext: TypeUseContext = {
    typespace,
    definitions: declaredTypeRefs,
    validatedUseRefs: new Set(),
    validatedDefinitions: new Set(),
  }
  const resolvedTypeRefs = new Map<number, JsonValue>()
  const defaultOrderingByRef = new Map<number, boolean>()
  const validatedProductUseRefs = new Set<number>()
  const globalNames = new Set<string>()
  const tableSources = new Set<string>()
  const functionSources = new Set<string>()
  const indexSources = new Set<string>()
  const namedProducts = new Map<number, Readonly<{
    columns: readonly JsonObject[]
    columnNames: ReadonlySet<string>
  }>>()
  const requireNamedProduct = (ref: number): Readonly<{
    columns: readonly JsonObject[]
    columnNames: ReadonlySet<string>
  }> => {
    const cached = namedProducts.get(ref)
    if (cached !== undefined) return cached
    if (ref >= typespace.length || typeTag(typespace[ref]) !== 'Product') fail()
    const columns = productElements(typespace[ref], typespace, resolvedTypeRefs)
    if (columns.length > 0x1_0000) fail()
    const columnNames = new Set<string>()
    for (const column of columns) {
      const name = optionName(column)
      if (name === undefined) fail()
      addUnique(columnNames, name)
    }
    const result = { columns, columnNames }
    namedProducts.set(ref, result)
    return result
  }

  const typeNames = new Set<string>()
  for (const rawTypeDef of rawTypeDefs) {
    const typeDef = requireExactObject(rawTypeDef, ['source_name', 'ty', 'custom_ordering'])
    const sourceName = requireExactObject(typeDef.source_name, ['scope', 'source_name'])
    const scope = requireArray(sourceName.scope).map(requireIdentifier)
    const name = requireIdentifier(sourceName.source_name)
    const ref = requireUint(typeDef.ty, 0xffff_ffff)
    const customOrdering = requireBoolean(typeDef.custom_ordering)
    if (ref >= typespace.length || !['Product', 'Sum'].includes(typeTag(typespace[ref]))) fail()
    validateTypeDefinition(ref, typeUseContext)
    if (!customOrdering) {
      let defaultOrdering = defaultOrderingByRef.get(ref)
      if (defaultOrdering === undefined) {
        defaultOrdering = hasDefaultElementOrdering(typespace[ref], typespace)
        defaultOrderingByRef.set(ref, defaultOrdering)
      }
      if (!defaultOrdering) fail()
    }
    const canonicalTypeName = [...scope, name].map(part => requireIdentifier(pascalCase(part)))
    addUnique(typeNames, canonicalTypeName.join('::'))
  }

  const tables = new Map<string, TableInfo>()
  for (const rawTable of requireArray(sections.get('Tables') ?? [])) {
    const table = requireExactObject(rawTable, [
      'source_name', 'product_type_ref', 'primary_key', 'indexes', 'constraints', 'sequences',
      'table_type', 'table_access', 'default_values', 'is_event',
    ])
    const source = requireIdentifier(table.source_name)
    const canonical = canonicalName('Table', source, explicitNames)
    if (tableSources.has(source) || tables.has(canonical)) fail()
    tableSources.add(source)
    addGlobalName(globalNames, source, canonical)
    const productTypeRef = requireUint(table.product_type_ref, 0xffff_ffff)
    const { columns } = requireNamedProduct(productTypeRef)
    if (!validatedProductUseRefs.has(productTypeRef)) {
      for (const column of columns) validateTypeUse(column.algebraic_type, typeUseContext)
      validatedProductUseRefs.add(productTypeRef)
    }
    const primaryKey = readColumnList(table.primary_key, columns.length, true)
    if (primaryKey.length > 1) fail()
    const tableType = requireUnitVariant(table.table_type, TABLE_TYPE_TAGS)
    if (tableType !== 'System' && canonical.startsWith('st_')) fail()
    requireUnitVariant(table.table_access, TABLE_ACCESS_TAGS)
    requireBoolean(table.is_event)

    const indexes: readonly number[][] = requireArray(table.indexes).map(rawIndex => {
      const index = requireExactObject(rawIndex, ['source_name', 'accessor_name', 'algorithm'])
      const indexSource = readOptionalIdentifier(index.source_name)
      if (indexSource === undefined) fail()
      readOptionalIdentifier(index.accessor_name)
      const [algorithm, algorithmPayload] = tagged(index.algorithm)
      let indexColumns: readonly number[]
      if (algorithm === 'Direct') {
        const column = requireUint(algorithmPayload, 0xffff)
        if (
          column >= columns.length
          || !isDirectIndexType(columns[column].algebraic_type, typespace, resolvedTypeRefs)
        ) {
          fail()
        }
        indexColumns = [column]
      } else {
        if (algorithm !== 'BTree' && algorithm !== 'Hash') fail()
        indexColumns = readColumnList(algorithmPayload, columns.length, true)
      }
      const columnLabel = indexColumns.map(column => snakeCase(optionName(columns[column]) ?? fail())).join('_')
      const generatedName = requireIdentifier(
        `${canonical}_${columnLabel}_idx_${algorithm.toLowerCase()}`,
      )
      const indexCanonical = explicitNames.Index.get(indexSource) ?? generatedName
      requireIdentifier(indexCanonical)
      addUnique(indexSources, indexSource)
      addGlobalName(globalNames, indexSource, indexCanonical)
      return [...indexColumns]
    })

    const indexColumnSets = new Set(indexes.map(columnSetKey))
    const constraintColumnSets = new Set<string>()
    requireArray(table.constraints).forEach(rawConstraint => {
      const constraint = requireExactObject(rawConstraint, ['source_name', 'data'])
      readOptionalIdentifier(constraint.source_name)
      const [kind, uniquePayload] = tagged(constraint.data)
      if (kind !== 'Unique') fail()
      const unique = requireExactObject(uniquePayload, ['columns'])
      const columnsList = [...readColumnList(unique.columns, columns.length, true)]
      const columnLabel = columnsList.map(column => snakeCase(optionName(columns[column]) ?? fail())).join('_')
      const generatedName = requireIdentifier(`${canonical}_${columnLabel}_key`)
      addGlobalName(globalNames, generatedName, generatedName)
      const key = columnSetKey(columnsList)
      if (!indexColumnSets.has(key)) fail()
      constraintColumnSets.add(key)
    })
    if (primaryKey.length === 1 && !constraintColumnSets.has(columnSetKey(primaryKey))) fail()

    const sequenceColumns = new Set<number>()
    for (const rawSequence of requireArray(table.sequences)) {
      const sequence = requireExactObject(rawSequence, [
        'source_name', 'column', 'start', 'min_value', 'max_value', 'increment',
      ])
      const sequenceSource = readOptionalIdentifier(sequence.source_name)
      const column = requireUint(sequence.column, 0xffff)
      if (column >= columns.length || !isIntegerType(columns[column].algebraic_type)) fail()
      addUnique(sequenceColumns, column)
      const sequenceName = sequenceSource
        ?? requireIdentifier(`${canonical}_${snakeCase(optionName(columns[column]) ?? fail())}_seq`)
      addGlobalName(globalNames, sequenceName, sequenceName)
      const start = readOption(sequence.start, requireInteger)
      const minimum = readOption(sequence.min_value, requireInteger)
      const maximum = readOption(sequence.max_value, requireInteger)
      requireInteger(sequence.increment)
      if (
        (minimum !== undefined && start !== undefined && minimum > start)
        || (start !== undefined && maximum !== undefined && start > maximum)
        || (minimum !== undefined && maximum !== undefined && minimum > maximum)
      ) {
        fail()
      }
    }

    const defaultColumns = new Set<number>()
    for (const rawDefault of requireArray(table.default_values)) {
      const columnDefault = requireExactObject(rawDefault, ['col_id', 'value'])
      const column = requireUint(columnDefault.col_id, 0xffff)
      if (column >= columns.length) fail()
      addUnique(defaultColumns, column)
      validateBsatnBytes(
        requireString(columnDefault.value),
        columns[column].algebraic_type,
        typespace,
        resolvedTypeRefs,
      )
    }

    const info = { source, canonical, productTypeRef, columns, primaryKey }
    tables.set(canonical, info)
  }

  const functions = new Map<string, FunctionInfo>()
  const reducers = new Map<string, FunctionInfo>()
  const addFunction = (
    sourceValue: JsonValue,
    paramsValue: JsonValue,
    target: Map<string, FunctionInfo>,
  ): FunctionInfo => {
    const source = requireIdentifier(sourceValue)
    const canonical = canonicalName('Function', source, explicitNames)
    if (functionSources.has(source) || functions.has(canonical)) fail()
    functionSources.add(source)
    const params = validateProductType(paramsValue, typespace, true)
    for (const param of params) validateTypeUse(param.algebraic_type, typeUseContext)
    const info = { source, canonical, params }
    functions.set(canonical, info)
    target.set(canonical, info)
    return info
  }

  for (const rawReducer of requireArray(sections.get('Reducers') ?? [])) {
    const reducer = requireExactObject(rawReducer, [
      'source_name', 'params', 'visibility', 'ok_return_type', 'err_return_type',
    ])
    addFunction(reducer.source_name, reducer.params, reducers)
    requireUnitVariant(reducer.visibility, VISIBILITY_TAGS)
    validateAlgebraicType(reducer.ok_return_type, typespace)
    validateAlgebraicType(reducer.err_return_type, typespace)
    if (!isUnitType(reducer.ok_return_type) || !isStringType(reducer.err_return_type)) fail()
  }

  const procedures = new Map<string, FunctionInfo>()
  for (const rawProcedure of requireArray(sections.get('Procedures') ?? [])) {
    const procedure = requireExactObject(rawProcedure, ['source_name', 'params', 'return_type', 'visibility'])
    addFunction(procedure.source_name, procedure.params, procedures)
    validateAlgebraicType(procedure.return_type, typespace)
    validateTypeUse(procedure.return_type, typeUseContext)
    requireUnitVariant(procedure.visibility, VISIBILITY_TAGS)
  }

  const views = new Map<string, Readonly<{
    source: string
    canonical: string
    columnNames: ReadonlySet<string>
  }>>()
  const viewsBySource = new Map<string, Readonly<{
    source: string
    canonical: string
    columnNames: ReadonlySet<string>
  }>>()
  const viewIndexes = new Set<string>()
  for (const rawView of requireArray(sections.get('Views') ?? [])) {
    const view = requireExactObject(rawView, [
      'source_name', 'index', 'is_public', 'is_anonymous', 'params', 'return_type',
    ])
    const source = requireIdentifier(view.source_name)
    const canonical = canonicalName('Function', source, explicitNames)
    if (functionSources.has(source) || functions.has(canonical) || views.has(canonical)) fail()
    functionSources.add(source)
    const params = validateProductType(view.params, typespace, true)
    for (const param of params) validateTypeUse(param.algebraic_type, typeUseContext)
    const index = requireUint(view.index, 0xffff_ffff)
    requireBoolean(view.is_public)
    const anonymous = requireBoolean(view.is_anonymous)
    addUnique(viewIndexes, `${anonymous ? 'anonymous' : 'authenticated'}:${index}`)
    validateAlgebraicType(view.return_type, typespace)
    const returnRef = extractViewReturnRef(view.return_type)
    validateTypeUse(typeTag(view.return_type) === 'Product' ? { Array: { Ref: returnRef } } : view.return_type, typeUseContext)
    const { columnNames } = requireNamedProduct(returnRef)
    const info = { source, canonical, params }
    functions.set(canonical, info)
    addGlobalName(globalNames, source, canonical)
    const validatedView = { source, canonical, columnNames }
    views.set(canonical, validatedView)
    viewsBySource.set(source, validatedView)
  }

  const handlerSources = new Set<string>()
  const handlers = new Map<string, string>()
  for (const rawHandler of requireArray(sections.get('HttpHandlers') ?? [])) {
    const handler = requireExactObject(rawHandler, ['source_name'])
    const source = requireIdentifier(handler.source_name)
    const canonical = canonicalName('Function', source, explicitNames)
    if (handlerSources.has(source) || handlers.has(canonical)) fail()
    handlerSources.add(source)
    handlers.set(canonical, source)
  }

  const routeMethods = new Map<string, Set<string>>()
  for (const rawRoute of requireArray(sections.get('HttpRoutes') ?? [])) {
    const route = requireExactObject(rawRoute, ['handler_function', 'method', 'path'])
    const handlerSource = requireIdentifier(route.handler_function)
    const handlerCanonical = canonicalName('Function', handlerSource, explicitNames)
    if (!handlers.has(handlerCanonical)) fail()
    const path = requireString(route.path)
    if ((!path.startsWith('/') && path.length !== 0) || !/^[a-z0-9\-_~/]*$/u.test(path)) fail()
    const [methodOrAny, methodPayload] = tagged(route.method)
    let methodKey: string
    if (methodOrAny === 'Any') {
      if (!Array.isArray(methodPayload) || methodPayload.length !== 0) fail()
      methodKey = '*'
    } else if (methodOrAny === 'Method') {
      const [method, payload] = tagged(methodPayload)
      if (HTTP_METHOD_TAGS.has(method)) {
        if (!Array.isArray(payload) || payload.length !== 0) fail()
        methodKey = method
      } else if (method === 'Extension') {
        methodKey = `Extension:${requireString(payload)}`
      } else {
        fail()
      }
    } else {
      fail()
    }
    const existingMethods = routeMethods.get(path) ?? new Set<string>()
    if (existingMethods.has('*') || existingMethods.has(methodKey) || (methodKey === '*' && existingMethods.size > 0)) fail()
    existingMethods.add(methodKey)
    routeMethods.set(path, existingMethods)
  }

  const seenViewPrimaryKeys = new Set<string>()
  for (const rawPrimaryKey of requireArray(sections.get('ViewPrimaryKeys') ?? [])) {
    const primaryKey = requireExactObject(rawPrimaryKey, ['view_source_name', 'columns'])
    const source = requireIdentifier(primaryKey.view_source_name)
    const view = viewsBySource.get(source)
    if (view === undefined) fail()
    addUnique(seenViewPrimaryKeys, source)
    const columns = requireArray(primaryKey.columns).map(requireIdentifier)
    if (columns.length > 1) fail()
    if (columns.some(column => !view.columnNames.has(column))) fail()
  }

  const scheduledTables = new Set<string>()
  for (const rawSchedule of requireArray(sections.get('Schedules') ?? [])) {
    const schedule = requireExactObject(rawSchedule, [
      'source_name', 'table_name', 'schedule_at_col', 'function_name',
    ])
    readOptionalIdentifier(schedule.source_name)
    const tableSource = requireIdentifier(schedule.table_name)
    const table = tables.get(canonicalName('Table', tableSource, explicitNames))
    if (table === undefined) fail()
    addUnique(scheduledTables, table.canonical)
    const generatedScheduleName = requireIdentifier(`${table.canonical}_sched`)
    addGlobalName(globalNames, generatedScheduleName, generatedScheduleName)
    const atColumn = requireUint(schedule.schedule_at_col, 0xffff)
    if (atColumn >= table.columns.length || !isScheduleAtType(table.columns[atColumn].algebraic_type)) fail()
    if (
      table.primaryKey.length !== 1
      || typeTag(table.columns[table.primaryKey[0]].algebraic_type) !== 'U64'
    ) {
      fail()
    }
    const functionSource = requireIdentifier(schedule.function_name)
    const fn = functions.get(canonicalName('Function', functionSource, explicitNames))
    if (fn === undefined || (!reducers.has(fn.canonical) && !procedures.has(fn.canonical))) fail()
    if (fn.params.length !== 1 || typeRef(fn.params[0].algebraic_type) !== table.productTypeRef) fail()
  }

  const lifecycleSpecs = new Set<string>()
  const lifecycleReducers = new Set<string>()
  for (const rawLifecycle of requireArray(sections.get('LifeCycleReducers') ?? [])) {
    const lifecycle = requireExactObject(rawLifecycle, ['lifecycle_spec', 'function_name'])
    const spec = requireUnitVariant(lifecycle.lifecycle_spec, LIFECYCLE_TAGS)
    addUnique(lifecycleSpecs, spec)
    const source = requireIdentifier(lifecycle.function_name)
    const canonical = canonicalName('Function', source, explicitNames)
    if (!reducers.has(canonical)) fail()
    addUnique(lifecycleReducers, canonical)
  }

  for (const rawRls of requireArray(sections.get('RowLevelSecurity') ?? [])) {
    const rls = requireExactObject(rawRls, ['sql'])
    requireString(rls.sql)
  }

  const explicitSources: Readonly<Record<ExplicitNameKind, ReadonlySet<string>>> = {
    Table: tableSources,
    Function: new Set([...functionSources, ...handlerSources]),
    Index: indexSources,
  }
  for (const kind of ['Table', 'Function', 'Index'] as const) {
    const canonicalNames = new Set<string>()
    for (const [source, canonical] of explicitNames[kind]) {
      if (!explicitSources[kind].has(source)) fail()
      addUnique(canonicalNames, canonical)
    }
  }
}

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return Object.freeze(value.map(item => canonicalize(item)))
  if (isObject(value)) {
    const output: Record<string, JsonValue> = Object.create(null)
    for (const key of Object.keys(value).sort()) output[key] = canonicalize(value[key])
    return Object.freeze(output)
  }
  return value
}

export function parseAndNormalizeRawModuleDefV10(input: Uint8Array): NormalizedRawModuleDefV10 {
  if (!(input instanceof Uint8Array) || input.byteLength > RAW_MODULE_DEF_V10_MAX_BYTES) fail()
  if (input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf) fail()

  let parsed: JsonValue
  try {
    parsed = new BoundedStrictJsonParser(decoder.decode(input)).parseDocument()
  } catch (error) {
    if (error instanceof RawModuleDefV10Error) throw error
    fail()
  }

  try {
    const document = requireExactObject(parsed, ['sections'])
    const rawSections = requireArray(document.sections)
    const byTag = new Map<RawModuleDefV10SectionTag, JsonValue>()

    for (const section of rawSections) {
      if (!isObject(section) || Object.keys(section).length !== 1) fail()
      const tag = Object.keys(section)[0]
      if (tag === undefined || !SECTION_TAGS.has(tag) || byTag.has(tag as RawModuleDefV10SectionTag)) fail()
      const typedTag = tag as RawModuleDefV10SectionTag
      byTag.set(typedTag, section[tag])
    }

    validateModule(byTag)

    const sections = Object.freeze(
      RAW_MODULE_DEF_V10_SECTION_ORDER.flatMap(tag => {
        const payload = byTag.get(tag)
        if (payload === undefined) return []
        const tagged: Record<string, JsonValue> = Object.create(null)
        tagged[tag] = canonicalize(payload)
        return [Object.freeze(tagged)]
      }),
    ) as RawModuleDefV10Value['sections']
    const value = Object.freeze({ sections })
    const retained = encoder.encode(JSON.stringify(value))

    return Object.freeze({
      value,
      canonicalBytes: (): Uint8Array => retained.slice(),
    })
  } catch (error) {
    if (error instanceof RawModuleDefV10Error) throw error
    fail()
  }
}
