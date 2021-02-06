import { describe, it } from 'mocha'
import { expect } from 'chai'
import { parse } from '@babel/parser'
import dedent from 'dedent'
import areASTsEqual from '../src/util/areASTsEqual'

describe(`areASTsEqual`, function () {
  it(`works`, function () {
    expect(
      areASTsEqual(
        parse(dedent`
          function foo(a, b) {
            // test
            return a + b
          }
        `),
        parse(dedent`
          function foo(a, b) {
            /* test*/
            return a + b
          }
        `)
      )
    ).to.be.true

    expect(
      areASTsEqual(
        parse(dedent`
          function foo(a, b) {
            // test
            return a + b
          }
        `),
        parse(dedent`
          function foo(a, b) {
            /* test*/
            return b + a
          }
        `)
      )
    ).to.be.false
  })
})
