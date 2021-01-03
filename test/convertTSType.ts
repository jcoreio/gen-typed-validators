import { describe, it } from 'mocha'
import { expect } from 'chai'
import normalizeTS from './util/normalizeTS'
import { FileConversionContext } from '../src/convert/index'
import traverse, { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import { parse } from '@babel/parser'
import dedent from 'dedent'

function assertExpressionsEqual(
  actual: t.Expression | string,
  expected: t.Expression | string
): void {
  expect(normalizeTS(actual)).to.equal(normalizeTS(expected))
}

function getTSTypePath(code: string): NodePath<any> {
  const ast = parse(`_ as ${code}`, {
    plugins: ['typescript'],
  })
  let path: NodePath<any>
  traverse(ast, {
    TSAsExpression(p: NodePath<t.TSAsExpression>) {
      path = p.get('typeAnnotation')
      p.stop()
    },
  })
  if (!path) throw new Error('failed to get node path')
  return path
}

function notImplemented(): any {
  throw new Error('not implemented')
}

function test(
  input: string,
  expected: string,
  { name = `${input} -> ${expected}` }: { name?: string } = {}
): void {
  it(name, async function() {
    const converted = await new FileConversionContext({
      file: 'temp.js',
      parseFile: notImplemented,
    }).convert(getTSTypePath(input))
    assertExpressionsEqual(converted, expected)
  })
}

function testError(
  input: string,
  expected: string | RegExp,
  { name = `${input} throws ${expected}` }: { name?: string } = {}
): void {
  it(name, async function() {
    await expect(
      new FileConversionContext({
        file: 'temp.js',
        parseFile: notImplemented,
      }).convert(getTSTypePath(input))
    ).to.be.rejectedWith(expected)
  })
}

type Fixture = {
  name: string
  input: string
  expected?: string
  error?: string | RegExp
  only?: boolean
  skip?: boolean
}

describe(`convertTSType`, function() {
  test('void', 't.undefined()')
  test('undefined', 't.undefined()')
  test('null', 't.null()')
  test('boolean', 't.boolean()')
  test('number', 't.number()')
  test('string', 't.string()')
  test('symbol', 't.symbol()')
  test('2', 't.number(2)')
  test(`'foo'`, `t.string('foo')`)
  test('true', 't.boolean(true)')
  test('number[]', 't.array(t.number())')
  test('[number, string]', 't.tuple(t.number(), t.string())')
  test('number | string', 't.oneOf(t.number(), t.string())')
  test('number & string', 't.allOf(t.number(), t.string())')
  test('Record<string, number>', 't.record(t.string(), t.number())')
  test(
    `{ [foo]: string }`,
    `t.object({
        [foo]: t.string()
      })`
  )
  test(
    `{ 'hello-world': string }`,
    `t.object({
        "hello-world": t.string()
      })`
  )
  test(
    '{ hello: string, world?: number }',
    `t.object({
        required: {
          hello: t.string()
        },
        optional: {
          world: t.number()
        },
      })`
  )
  test(
    '{ world?: number }',
    `t.object({
        optional: {
          world: t.number(),
        },
      })`
  )

  testError('() => number', /Unsupported type/)
  testError('Record', /Record is missing type parameters/)
  testError('Record<string>', /Record is missing value type/)
  testError('{ [foo + bar]: string }', /Unsupported key type/)

  function findPath<T extends t.Node>(
    ast: t.File,
    type: T['type']
  ): NodePath<T> {
    let result: NodePath<T> | undefined
    traverse(ast, {
      // work around @babel/traverse bug
      TSTypeAliasDeclaration(path: NodePath<t.TSTypeAliasDeclaration>) {
        path.scope.registerBinding(
          'type',
          path.get('id') as NodePath<any>,
          path as NodePath<any>
        )
      },
      enter(path: NodePath<any>) {
        if (path.node.type === type) {
          result = path
          path.stop()
        }
      },
    })
    if (!result) throw new Error(`failed to find a ${type} node`)
    return result
  }

  class TypeReferenceSpy {
    typeRefs: { file: string; node: string }[] = []

    onTypeReference = ({
      file,
      path,
    }: {
      file: string
      path: NodePath<any>
    }): any => this.typeRefs.push({ file, node: normalizeTS(path) })
  }

  describe(`builtin class conversion`, function() {
    for (const klass of ['Date']) {
      it(klass, async function() {
        const a = dedent`
          type Test = Date[]
        `

        const parseFile = async (file: string): Promise<t.File> => {
          switch (file) {
            case '/a':
              return parse(a, { plugins: ['typescript'], sourceType: 'module' })
          }
        }

        const { typeRefs, onTypeReference } = new TypeReferenceSpy()

        const converted = await new FileConversionContext({
          file: '/a',
          parseFile,
          onTypeReference,
        }).convert(findPath(await parseFile('/a'), 'TSArrayType'))
        assertExpressionsEqual(converted, `t.array(t.instanceOf(() => Date))`)
        expect(typeRefs).to.deep.equal([])
      })
    }
  })

  it(`local class conversion`, async function() {
    const a = dedent`
      class B {}
      type Test = B[]
    `

    const parseFile = async (file: string): Promise<t.File> => {
      switch (file) {
        case '/a':
          return parse(a, { plugins: ['typescript'], sourceType: 'module' })
      }
    }

    const { typeRefs, onTypeReference } = new TypeReferenceSpy()

    const converted = await new FileConversionContext({
      file: '/a',
      parseFile,
      onTypeReference,
    }).convert(findPath(await parseFile('/a'), 'TSArrayType'))
    assertExpressionsEqual(converted, `t.array(t.instanceOf(() => B))`)
    expect(typeRefs).to.deep.equal([
      { file: '/a', node: normalizeTS(`class B {}`) },
    ])
  })

  it(`local type alias conversion`, async function() {
    const a = dedent`
      type B = {}
      type Test = B[]
    `

    const parseFile = async (file: string): Promise<t.File> => {
      switch (file) {
        case '/a':
          return parse(a, { plugins: ['typescript'], sourceType: 'module' })
      }
    }

    const { typeRefs, onTypeReference } = new TypeReferenceSpy()

    const converted = await new FileConversionContext({
      file: '/a',
      parseFile,
      onTypeReference,
    }).convert(findPath(await parseFile('/a'), 'TSArrayType'))
    assertExpressionsEqual(converted, `t.array(t.ref(() => BType))`)
    expect(typeRefs).to.deep.equal([
      { file: '/a', node: normalizeTS(`type B = {}`) },
    ])
  })

  it(`class import conversion`, async function() {
    const a = dedent`
      import B from './b'
      type Test = B[]
    `
    const b = dedent`
      export default class B { }
    `

    const parseFile = async (file: string): Promise<t.File> => {
      switch (file) {
        case '/a':
          return parse(a, { plugins: ['typescript'], sourceType: 'module' })
        case '/b':
          return parse(b, { plugins: ['typescript'], sourceType: 'module' })
      }
    }

    const { typeRefs, onTypeReference } = new TypeReferenceSpy()

    const converted = await new FileConversionContext({
      file: '/a',
      parseFile,
      onTypeReference,
    }).convert(findPath(await parseFile('/a'), 'TSArrayType'))
    assertExpressionsEqual(converted, `t.array(t.instanceOf(() => B))`)
    expect(typeRefs).to.deep.equal([
      { file: '/b', node: normalizeTS(`class B {}`) },
    ])
  })

  it(`namespaced class import conversion`, async function() {
    const a = dedent`
      import * as b from './b'
      type Test = b.B[]
    `
    const b = dedent`
      export class B { }
    `

    const parseFile = async (file: string): Promise<t.File> => {
      switch (file) {
        case '/a':
          return parse(a, { plugins: ['typescript'], sourceType: 'module' })
        case '/b':
          return parse(b, { plugins: ['typescript'], sourceType: 'module' })
      }
    }

    const { typeRefs, onTypeReference } = new TypeReferenceSpy()

    const converted = await new FileConversionContext({
      file: '/a',
      parseFile,
      onTypeReference,
    }).convert(findPath(await parseFile('/a'), 'TSArrayType'))
    assertExpressionsEqual(converted, `t.array(t.instanceOf(() => b.B))`)
    expect(typeRefs).to.deep.equal([
      { file: '/b', node: normalizeTS(`class B {}`) },
    ])
  })

  it(`imported type alias conversion`, async function() {
    const a = dedent`
      import type { B } from './b'
      type Test = B[]
    `
    const b = dedent`
      export type B = {}
    `

    const parseFile = async (file: string): Promise<t.File> => {
      switch (file) {
        case '/a':
          return parse(a, { plugins: ['typescript'], sourceType: 'module' })
        case '/b':
          return parse(b, { plugins: ['typescript'], sourceType: 'module' })
      }
    }

    const { typeRefs, onTypeReference } = new TypeReferenceSpy()

    const converted = await new FileConversionContext({
      file: '/a',
      parseFile,
      onTypeReference,
    }).convert(findPath(await parseFile('/a'), 'TSArrayType'))
    assertExpressionsEqual(converted, `t.array(t.ref(() => BType))`)
    expect(typeRefs).to.deep.equal([
      { file: '/b', node: normalizeTS(`type B = {}`) },
    ])
  })

  it(`namespaced imported type alias conversion`, async function() {
    const a = dedent`
      import * as b from './b'
      type Test = b.B[]
    `
    const b = dedent`
      export type B = {}
    `

    const parseFile = async (file: string): Promise<t.File> => {
      switch (file) {
        case '/a':
          return parse(a, { plugins: ['typescript'], sourceType: 'module' })
        case '/b':
          return parse(b, { plugins: ['typescript'], sourceType: 'module' })
      }
    }

    const { typeRefs, onTypeReference } = new TypeReferenceSpy()

    const converted = await new FileConversionContext({
      file: '/a',
      parseFile,
      onTypeReference,
    }).convert(findPath(await parseFile('/a'), 'TSArrayType'))
    assertExpressionsEqual(converted, `t.array(t.ref(() => b.BType))`)
    expect(typeRefs).to.deep.equal([
      { file: '/b', node: normalizeTS(`type B = {}`) },
    ])
  })
})
