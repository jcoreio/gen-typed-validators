import * as t from 'typed-validators'

type Blah = {
  bar: number
}

const BlahType: t.TypeAlias<Blah> = t.alias(
  'Blah',
  t.object({
    bar: t.number(),
  })
)

type Test = {
  foo: string
  blah: Blah
}

const TestType: t.TypeAlias<Test> = t.alias(
  'Test',
  t.object({
    foo: t.string(),
    blah: t.ref(() => BlahType),
  })
)
