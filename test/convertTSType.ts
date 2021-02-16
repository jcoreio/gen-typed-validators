import { describe, it } from 'mocha'
import { expect } from 'chai'
import normalizeTS from './util/normalizeTS'
import ConversionContext from '../src/convert/ConversionContext'
import traverse, { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import * as Path from 'path'
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
  let path: NodePath<any> | undefined
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
  it(name, async function () {
    const converted = await (
      await new ConversionContext({
        resolve: async (f: string): Promise<string> => f,
        parseFile: async (): Promise<t.File> => parse(''),
      }).forFile('temp.js')
    ).convert(getTSTypePath(input))
    assertExpressionsEqual(converted, expected)
  })
}

function testError(
  input: string,
  expected: string | RegExp,
  { name = `${input} throws ${expected}` }: { name?: string } = {}
): void {
  it(name, async function () {
    await expect(
      (
        await new ConversionContext({
          resolve: async (f: string): Promise<string> => f,
          parseFile: async (): Promise<t.File> => parse(''),
        }).forFile('temp.js')
      ).convert(getTSTypePath(input))
    ).to.be.rejectedWith(expected)
  })
}

async function integrationTest(
  input: Record<string, string>,
  expected: Record<string, string>
): Promise<void> {
  const context = new ConversionContext({
    resolve: async (
      file: string,
      { basedir }: { basedir: string }
    ): Promise<string> => Path.resolve(basedir, file),
    parseFile: async (file: string): Promise<t.File> => {
      const code = input[file]
      if (!code) throw new Error(`file not found: ${file}`)
      return parse(code, {
        plugins: ['typescript'],
        sourceType: 'module',
      })
    },
  })
  for (const file in input) await (await context.forFile(file)).processFile()
  for (const file in expected) {
    const ast = (await context.forFile(file)).processedAST
    if (!ast) throw new Error(`missing result AST for file: ${file}`)
    expect(normalizeTS(ast), `expected file ${file} to match`).to.equal(
      normalizeTS(expected[file])
    )
  }
}

describe(`convertTSType`, function () {
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

  it(`converts locally reified type alias`, async function () {
    await integrationTest(
      {
        '/a': `
          type Foo = {
            foo: number
          }
          const FooType = reify as Type<Foo>
        `,
      },
      {
        '/a': `
          import * as t from 'typed-validators'
          type Foo = {
            foo: number,
          }
          const FooType: t.TypeAlias<Foo> = t.alias(
            'Foo',
            t.object({
              foo: t.number(),
            })
          )
        `,
      }
    )
  })
  it(`converts locally reified builtin type`, async function () {
    await integrationTest(
      {
        '/a': `
          const FooType = reify as Type<number>
        `,
      },
      {
        '/a': `
          import * as t from 'typed-validators'
          const FooType = t.number()
        `,
      }
    )
  })
  it(`reconverts local validator declarations and dependent type validators`, async function () {
    await integrationTest(
      {
        '/a': `
          import * as t from 'typed-validators'
          type Foo = { foo: number }
          type Baz = { baz: number }
          const BazType = t.object({})
          type Bar = Foo &
            Baz & {
              bar: string
            }
          export const BarType: t.TypeAlias<Bar> = t.object({})
        `,
      },
      {
        '/a': `
          import * as t from 'typed-validators'
          type Foo = {
            foo: number,
          }
          const FooType: t.TypeAlias<Foo> = t.alias(
            'Foo',
            t.object({
              foo: t.number(),
            })
          )
          type Baz = {
            baz: number,
          }
          const BazType: t.TypeAlias<Baz> = t.alias(
            'Baz',
            t.object({
              baz: t.number(),
            })
          )
          type Bar = Foo &
            Baz & {
              bar: string
            }
          export const BarType: t.TypeAlias<Bar> = t.alias(
            'Bar',
            t.allOf(
              t.ref(() => FooType),
              t.ref(() => BazType),
              t.object({
                bar: t.string()
              })
            )
          )
        `,
      }
    )
  })
  it(`converts locally reified builtin class`, async function () {
    await integrationTest(
      {
        '/a': `
          const FooType = reify as Type<Date>
        `,
      },
      {
        '/a': `
          import * as t from 'typed-validators'
          const FooType = t.instanceOf(() => Date)
        `,
      }
    )
  })
  it(`converts locally reified class`, async function () {
    await integrationTest(
      {
        '/a': `
          class Foo {}
          const FooType = reify as Type<Foo>
        `,
      },
      {
        '/a': `
          import * as t from 'typed-validators'
          class Foo {}
          const FooType = t.instanceOf(() => Foo)
        `,
      }
    )
  })
  it(`converts named type import`, async function () {
    await integrationTest(
      {
        '/a': `
          import {Foo as Foob} from './foo'
          const FooType = reify as Type<Foob>
        `,
        '/foo': `
          export type Foo = {
            foo: number
          }
        `,
      },
      {
        '/a': `
          import {Foo as Foob, FooType as FoobType} from './foo'
          import * as t from 'typed-validators'
          const FooType = t.ref(() => FoobType)
        `,
        '/foo': `
          import * as t from 'typed-validators'
          export type Foo = {
            foo: number
          }
          export const FooType: t.TypeAlias<Foo> = t.alias(
            'Foo',
            t.object({
              foo: t.number(),
            })
          )
        `,
      }
    )
  })
  it(`converts interface import`, async function () {
    await integrationTest(
      {
        '/a': `
          import {reify, Type} from 'flow-runtime'
          import {Foo as Foob} from './foo'
          const FooType = reify as Type<Foob>
        `,
        '/foo': `
          export interface Foo {
            foo: number
          }
        `,
      },
      {
        '/a': `
          import {Foo as Foob, FooType as FoobType} from './foo'
          import * as t from 'typed-validators'
          const FooType = t.ref(() => FoobType)
        `,
        '/foo': `
          import * as t from 'typed-validators'
          export interface Foo {
            foo: number
          }
          export const FooType: t.TypeAlias<Foo> = t.alias(
            'Foo',
            t.object({
              foo: t.number(),
            })
          )
        `,
      }
    )
  })
  it(`converts interface import that implements another imported interface`, async function () {
    await integrationTest(
      {
        '/a': `
          import {reify, Type} from 'flow-runtime'
          import {Foo as Foob} from './foo'
          const FooType = reify as Type<Foob>
        `,
        '/foo': `
          import {Bar} from './bar'
          export interface Foo extends Bar {
            foo: number
          }
        `,
        '/bar': `
          export interface Bar {
            bar: string
          }
        `,
      },
      {
        '/a': `
          import {Foo as Foob, FooType as FoobType} from './foo'
          import * as t from 'typed-validators'
          const FooType = t.ref(() => FoobType)
        `,
        '/foo': `
          import {Bar, BarType} from './bar'
          import * as t from 'typed-validators'
          export interface Foo extends Bar {
            foo: number
          }
          export const FooType: t.TypeAlias<Foo> = t.alias(
            'Foo',
            t.merge(
              t.ref(() => BarType),
              t.object({
                foo: t.number(),
              })
            )
          )
        `,
        '/bar': `
          import * as t from 'typed-validators'
          export interface Bar {
            bar: string
          } 
          export const BarType: t.TypeAlias<Bar> = t.alias(
            'Bar',
            t.object({
              bar: t.string(),
            })
          )
        `,
      }
    )
  })
  it(`converts named type import that's indirectly exported`, async function () {
    await integrationTest(
      {
        '/a': `
          import {Foo as Foob} from './foo'
          const FooType = reify as Type<Foob>
        `,
        '/foo': `
          type Foo = {
            foo: number
          }
          export {Foo}
        `,
      },
      {
        '/a': `
          import {Foo as Foob, FooType as FoobType} from './foo'
          import * as t from 'typed-validators'
          const FooType = t.ref(() => FoobType)
        `,
        '/foo': `
          import * as t from 'typed-validators'
          type Foo = {
            foo: number
          }
          const FooType: t.TypeAlias<Foo> = t.alias(
            'Foo',
            t.object({
              foo: t.number(),
            })
          )
          export {Foo}
          export {FooType}
        `,
      }
    )
  })
  it(`converts named class import`, async function () {
    await integrationTest(
      {
        '/a': `
          import {Foo as Foob} from './foo'
          const FooType = reify as Type<Foob>
        `,
        '/foo': `
          export class Foo {}
        `,
      },
      {
        '/a': `
          import {Foo as Foob} from './foo'
          import * as t from 'typed-validators'
          const FooType = t.instanceOf(() => Foob)
        `,
        '/foo': `
          export class Foo {}
        `,
      }
    )
  })
  it(`converts named class import that's indirectly exported`, async function () {
    await integrationTest(
      {
        '/a': `
          import {Foo as Foob} from './foo'
          const FooType = reify as Type<Foob>
        `,
        '/foo': `
          class Foo {}
          export {Foo}
        `,
      },
      {
        '/a': `
          import {Foo as Foob} from './foo'
          import * as t from 'typed-validators'
          const FooType = t.instanceOf(() => Foob)
        `,
        '/foo': `
          class Foo {}
          export {Foo}
        `,
      }
    )
  })
  it(`converts default type import that's indirectly exported`, async function () {
    await integrationTest(
      {
        '/a': `
          import Foob from './foo'
          const FooType = reify as Type<Foob>
        `,
        '/foo': `
          type Foo = {
            foo: number
          }
          export default Foo
        `,
      },
      {
        '/a': `
          import {default as Foob, defaultType as FoobType} from './foo'
          import * as t from 'typed-validators'
          const FooType = t.ref(() => FoobType)
        `,
        '/foo': `
          import * as t from 'typed-validators'
          type Foo = {
            foo: number
          }
          const FooType: t.TypeAlias<Foo> = t.alias(
            'Foo',
            t.object({
              foo: t.number(),
            })
          )
          export default Foo
          export {FooType as defaultType}
        `,
      }
    )
  })
  it(`doesn't add duplicate import specifiers`, async function () {
    await integrationTest(
      {
        '/a': `
          import {default as Foob, defaultType as FoobType} from './foo'
          const FooType = reify as Type<Foob>
        `,
        '/foo': `
          type Foo = {
            foo: number
          }
          export default Foo
        `,
      },
      {
        '/a': `
          import {default as Foob, defaultType as FoobType} from './foo'
          import * as t from 'typed-validators'
          const FooType = t.ref(() => FoobType)
        `,
        '/foo': `
          import * as t from 'typed-validators'
          type Foo = {
            foo: number
          }
          const FooType: t.TypeAlias<Foo> = t.alias(
            'Foo',
            t.object({
              foo: t.number(),
            })
          )
          export default Foo
          export {FooType as defaultType}
        `,
      }
    )
  })
  it(`converts default class import`, async function () {
    await integrationTest(
      {
        '/a': `
          import Foob from './foo'
          const FooType = reify as Type<Foob>
        `,
        '/foo': `
          export default class Foo {}
        `,
      },
      {
        '/a': `
          import Foob from './foo'
          import * as t from 'typed-validators'
          const FooType = t.instanceOf(() => Foob)
        `,
        '/foo': `
          export default class Foo {}
        `,
      }
    )
  })
  it(`converts default class import that's indirectly exported`, async function () {
    await integrationTest(
      {
        '/a': `
          import Foob from './foo'
          const FooType = reify as Type<Foob>
        `,
        '/foo': `
          class Foo {}
          export default Foo
        `,
      },
      {
        '/a': `
          import Foob from './foo'
          import * as t from 'typed-validators'
          const FooType = t.instanceOf(() => Foob)
        `,
        '/foo': `
          class Foo {}
          export default Foo
        `,
      }
    )
  })
  it(`converts import from deps to any`, async function () {
    await integrationTest(
      {
        '/a': `
          import Foob from 'foo'
          const FooType = reify as Type<Foob>
        `,
      },
      {
        '/a': `
          import Foob from 'foo'
          import * as t from 'typed-validators'
          const FooType = t.any()
        `,
      }
    )
  })
})
