import { describe, it } from 'mocha'
import { expect } from 'chai'
import normalizeFlow from './util/normalizeFlow'
import ConversionContext from '../src/convert/ConversionContext'
import { parse } from '@babel/parser'
import traverse, { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import * as Path from 'path'

function assertExpressionsEqual(
  actual: t.Expression | string,
  expected: t.Expression | string
): void {
  expect(normalizeFlow(actual)).to.equal(normalizeFlow(expected))
}

function getFlowTypePath(code: string): NodePath<any> {
  const ast = parse(`(_: ${code})`, {
    plugins: [['flow', { all: true }]],
  })
  let path: NodePath<any> | undefined
  traverse(ast, {
    TypeAnnotation(p: NodePath<t.TypeAnnotation>) {
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
    ).convert(getFlowTypePath(input))
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
      ).convert(getFlowTypePath(input))
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
        plugins: [['flow', { all: true }]],
        sourceType: 'module',
      })
    },
  })
  for (const file in input) await (await context.forFile(file)).processFile()
  for (const file in expected) {
    const ast = (await context.forFile(file)).processedAST
    if (!ast) throw new Error(`missing result AST for file: ${file}`)
    expect(normalizeFlow(ast), `expected file ${file} to match`).to.equal(
      normalizeFlow(expected[file])
    )
  }
}

describe(`convertFlowType`, function () {
  test('any', 't.any()')
  test('mixed', 't.unknown()')
  test('void', 't.undefined()')
  test('null', 't.null()')
  test('boolean', 't.boolean()')
  test('number', 't.number()')
  test('string', 't.string()')
  test('symbol', 't.symbol()')
  test('2', 't.number<2>(2)')
  test(`'foo'`, `t.string<'foo'>('foo')`)
  test('true', 't.boolean<true>(true)')
  test('?number', 't.nullishOr(t.number())')
  test('number[]', 't.array(t.number())')
  test('Array<number>', 't.array(t.number())')
  test('$ReadOnlyArray<number>', 't.readonlyArray(t.number())')
  test('[number, string]', 't.tuple(t.number(), t.string())')
  test('number | string', 't.oneOf(t.number(), t.string())')
  test('number & string', 't.allOf(t.number(), t.string())')
  test('{[string]: number}', 't.record(t.string(), t.number())')
  test(
    '$ReadOnly<{[string]: number}>',
    't.readonly(t.record(t.string(), t.number()))'
  )
  test(
    `{ 'hello-world': string, ... }`,
    `t.object({
        exact: false,
        required: {
          "hello-world": t.string(),
        },
      })`
  )
  test(
    '{| hello: string |}',
    `t.object({
        hello: t.string()
      })`
  )
  test(
    '{| hello: string, world?: number |}',
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
    '{| world?: number |}',
    `t.object({
        optional: {
          world: t.number(),
        },
      })`
  )
  test(
    '{ world?: number, ... }',
    `t.object({
        exact: false,
        optional: {
          world: t.number(),
        },
      })`
  )

  testError('() => number', /Unsupported type/)
  testError(
    '{foo: number, [number]: string}',
    /Properties mixed with indexers aren't supported/
  )
  testError(
    '{[string]: number, [number]: string}',
    /Multiple indexers aren't supported/
  )

  it(`converts locally reified spread type aliases`, async function () {
    await integrationTest(
      {
        '/a': `
          import {reify, type Type} from 'flow-runtime'
          type Foo = {| foo: number |}
          type Baz = {| baz: number |}
          type Bar = {| ...$Exact<Foo>, ...Baz, bar: string |}
          const BarType = (reify: Type<Bar>)
        `,
      },
      {
        '/a': `
          import * as t from 'typed-validators'
          type Foo = {|
            foo: number,
          |}
          const FooType: t.TypeAlias<Foo> = t.alias(
            'Foo',
            t.object({
              foo: t.number(),
            })
          )
          type Baz = {|
            baz: number,
          |}
          const BazType: t.TypeAlias<Baz> = t.alias(
            'Baz',
            t.object({
              baz: t.number(),
            })
          )
          type Bar = {| ...$Exact<Foo>, ...Baz, bar: string |}
          const BarType: t.TypeAlias<Bar> = t.alias(
            'Bar',
            t.merge(
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
  it(`reconverts local validator declarations and dependent type validators`, async function () {
    await integrationTest(
      {
        '/a': `
          import * as t from 'typed-validators'
          type Foo = {| foo: number |}
          type Baz = {| baz: number |}
          const BazType = t.object({})
          type Bar = {| ...$Exact<Foo>, ...Baz, bar: string |}
          export const BarType: t.TypeAlias<Bar> = t.object({})
        `,
      },
      {
        '/a': `
          import * as t from 'typed-validators'
          type Foo = {|
            foo: number,
          |}
          const FooType: t.TypeAlias<Foo> = t.alias(
            'Foo',
            t.object({
              foo: t.number(),
            })
          )
          type Baz = {|
            baz: number,
          |}
          const BazType: t.TypeAlias<Baz> = t.alias(
            'Baz',
            t.object({
              baz: t.number(),
            })
          )
          type Bar = {| ...$Exact<Foo>, ...Baz, bar: string |}
          export const BarType: t.TypeAlias<Bar> = t.alias(
            'Bar',
            t.merge(
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
  it(`converts locally reified builtin type`, async function () {
    await integrationTest(
      {
        '/a': `
          import {reify, type Type} from 'flow-runtime'
          const FooType = (reify: Type<number>)
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
  it(`converts locally reified builtin class`, async function () {
    await integrationTest(
      {
        '/a': `
          import {reify, type Type} from 'flow-runtime'
          const FooType = (reify: Type<Date>)
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
          import {reify, type Type} from 'flow-runtime'
          class Foo {}
          const FooType = (reify: Type<Foo>)
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
          import {reify, type Type} from 'flow-runtime'
          import {type Foo as Foob} from './foo'
          const FooType = (reify: Type<Foob>)
        `,
        '/foo': `
          export type Foo = {|
            foo: number
          |}
        `,
      },
      {
        '/a': `
          import {type Foo as Foob, FooType as FoobType} from './foo'
          import * as t from 'typed-validators'
          const FooType = t.ref(() => FoobType)
        `,
        '/foo': `
          import * as t from 'typed-validators'
          export type Foo = {|
            foo: number
          |}
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
          import {reify, type Type} from 'flow-runtime'
          import {type Foo as Foob} from './foo'
          const FooType = (reify: Type<Foob>)
        `,
        '/foo': `
          export interface Foo {
            foo: number
          }
        `,
      },
      {
        '/a': `
          import {type Foo as Foob, FooType as FoobType} from './foo'
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
              exact: false,
              required: {
                foo: t.number(),
              },
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
          import {reify, type Type} from 'flow-runtime'
          import {type Foo as Foob} from './foo'
          const FooType = (reify: Type<Foob>)
        `,
        '/foo': `
          import {type Bar} from './bar'
          export interface Foo implements Bar {
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
          import {type Foo as Foob, FooType as FoobType} from './foo'
          import * as t from 'typed-validators'
          const FooType = t.ref(() => FoobType)
        `,
        '/foo': `
          import {type Bar, BarType} from './bar'
          import * as t from 'typed-validators'
          export interface Foo implements Bar {
            foo: number
          }
          export const FooType: t.TypeAlias<Foo> = t.alias(
            'Foo',
            t.mergeInexact(
              t.ref(() => BarType),
              t.object({
                exact: false,
                required: {
                  foo: t.number(),
                },
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
              exact: false,
              required: {
                bar: t.string(),
              },
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
          import {reify, type Type} from 'flow-runtime'
          import {type Foo as Foob} from './foo'
          const FooType = (reify: Type<Foob>)
        `,
        '/foo': `
          type Foo = {|
            foo: number
          |}
          export type {Foo}
        `,
      },
      {
        '/a': `
          import {type Foo as Foob, FooType as FoobType} from './foo'
          import * as t from 'typed-validators'
          const FooType = t.ref(() => FoobType)
        `,
        '/foo': `
          import * as t from 'typed-validators'
          type Foo = {|
            foo: number
          |}
          const FooType: t.TypeAlias<Foo> = t.alias(
            'Foo',
            t.object({
              foo: t.number(),
            })
          )
          export type {Foo}
          export {FooType}
        `,
      }
    )
  })
  it(`converts named class import`, async function () {
    await integrationTest(
      {
        '/a': `
          import {reify, type Type} from 'flow-runtime'
          import {Foo as Foob} from './foo'
          const FooType = (reify: Type<Foob>)
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
          import {reify, type Type} from 'flow-runtime'
          import {Foo as Foob} from './foo'
          const FooType = (reify: Type<Foob>)
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
  it(`converts named class type import`, async function () {
    await integrationTest(
      {
        '/a': `
          import {reify, type Type} from 'flow-runtime'
          import {type Foo as Foob} from './foo'
          const FooType = (reify: Type<Foob>)
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
  it(`converts default type import that's indirectly exported`, async function () {
    await integrationTest(
      {
        '/a': `
          import {reify, type Type} from 'flow-runtime'
          import type Foob from './foo'
          const FooType = (reify: Type<Foob>)
        `,
        '/foo': `
          type Foo = {|
            foo: number
          |}
          export type {Foo as default}
        `,
      },
      {
        '/a': `
          import {type default as Foob, defaultType as FoobType} from './foo'
          import * as t from 'typed-validators'
          const FooType = t.ref(() => FoobType)
        `,
        '/foo': `
          import * as t from 'typed-validators'
          type Foo = {|
            foo: number
          |}
          const FooType: t.TypeAlias<Foo> = t.alias(
            'Foo',
            t.object({
              foo: t.number(),
            })
          )
          export type {Foo as default}
          export {FooType as defaultType}
        `,
      }
    )
  })
  it(`converts default class import`, async function () {
    await integrationTest(
      {
        '/a': `
          import {reify, type Type} from 'flow-runtime'
          import Foob from './foo'
          const FooType = (reify: Type<Foob>)
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
          import {reify, type Type} from 'flow-runtime'
          import Foob from './foo'
          const FooType = (reify: Type<Foob>)
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
  it(`converts default class type import`, async function () {
    await integrationTest(
      {
        '/a': `
          import {reify, type Type} from 'flow-runtime'
          import type Foob from './foo'
          const FooType = (reify: Type<Foob>)
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
  it(`converts import from deps to any`, async function () {
    await integrationTest(
      {
        '/a': `
          import {reify, type Type} from 'flow-runtime'
          import type Foob from 'foo'
          const FooType = (reify: Type<Foob>)
        `,
      },
      {
        '/a': `
          import type Foob from 'foo'
          import * as t from 'typed-validators'
          const FooType = t.any()
        `,
      }
    )
  })
  it(`converts any in override comment`, async function () {
    await integrationTest(
      {
        '/a': `
          import * as t from 'typed-validators'
          // @gen-typed-validators type: any
          type Foog = {}
          type Foo = {
            bar: Foog
          }
          const FooType: t.TypeAlias<Foo> = null
        `,
      },
      {
        '/a': `
          import * as t from 'typed-validators' // @gen-typed-validators type: any
          type Foog = {}
          type Foo = {
            bar: Foog
          }
          const FooType: t.TypeAlias<Foo> = t.alias(
            'Foo',
            t.object({
              bar: t.any(),
            })
          )
        `,
      }
    )
  })
  it(`converts type reference in override comment`, async function () {
    await integrationTest(
      {
        '/a': `
          import * as t from 'typed-validators'
          type Bar = {}
          // @gen-typed-validators type: Bar
          type Foog = {}
          type Foo = {
            bar: Foog
          }
          const FooType: t.TypeAlias<Foo> = null
        `,
      },
      {
        '/a': `
          import * as t from 'typed-validators'
          type Bar = {};
          const BarType: t.TypeAlias<Bar> = t.alias("Bar", t.object({}));
          // @gen-typed-validators type: Bar
          type Foog = {}
          type Foo = {
            bar: Foog
          }
          const FooType: t.TypeAlias<Foo> = t.alias(
            'Foo',
            t.object({
              bar: t.ref(() => BarType),
            })
          )
        `,
      }
    )
  })
})
