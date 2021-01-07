import { describe, it } from 'mocha'
import { expect } from 'chai'
import normalizeTS from './util/normalizeTS'
import { ConversionContext } from '../src/convert/index'
import traverse, { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import { parse } from '@babel/parser'

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

function test(
  input: string,
  expected: string,
  { name = `${input} -> ${expected}` }: { name?: string } = {}
): void {
  it(name, async function() {
    const converted = await new ConversionContext({
      parseFile: async (): Promise<t.File> => parse(''),
    })
      .forFile('temp.js')
      .convert(getTSTypePath(input))
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
      new ConversionContext({
        parseFile: async (): Promise<t.File> => parse(''),
      })
        .forFile('temp.js')
        .convert(getTSTypePath(input))
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
})
