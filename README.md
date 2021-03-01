# gen-typed-validators

[![CircleCI](https://circleci.com/gh/jcoreio/gen-typed-validators.svg?style=svg)](https://circleci.com/gh/jcoreio/gen-typed-validators)
[![Coverage Status](https://codecov.io/gh/jcoreio/gen-typed-validators/branch/master/graph/badge.svg)](https://codecov.io/gh/jcoreio/gen-typed-validators)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
[![npm version](https://badge.fury.io/js/gen-typed-validators.svg)](https://badge.fury.io/js/gen-typed-validators)

Automatically generate runtime validators from your Flow or TypeScript type definitions! (using `typed-validators`)

# Table of Contents

<!-- toc -->

- [How it works](#how-it-works)
- [Type Walking](#type-walking)
- [Limitations](#limitations)
- [CLI](#cli)

<!-- tocstop -->

# How it works

Say you want to generate validators for a `User` type. Just add a `const UserType: t.TypeAlias<User> = null` declaration
after it and run this codemod:

```ts
// User.ts

export type Address = {
  line1: string
  line2?: string
  city: string
  zipCode: string
}

export type User = {
  email: string
  firstName?: string
  lastName?: string
  address?: Address
}

export const UserType: t.TypeAlias<User> = null
```

```diff
$ gen-typed-validators User.ts

/Users/andy/github/typed-validators-codemods/User.ts
======================================

+ modified - original

@@ -1,15 +1,44 @@
+import * as t from 'typed-validators'
 export type Address = {
   line1: string
   line2?: string
   city: string
   zipCode: string
 }

+export const AddressType: t.TypeAlias<Address> = t.alias(
+  'Address',
+  t.object({
+    required: {
+      line1: t.string(),
+      city: t.string(),
+      zipCode: t.string(),
+    },
+
+    optional: {
+      line2: t.string(),
+    },
+  })
+)
+
 export type User = {
   email: string
   firstName?: string
   lastName?: string
   address?: Address
 }

-export const UserType: t.TypeAlias<User> = null
+export const UserType: t.TypeAlias<User> = t.alias(
+  'User',
+  t.object({
+    required: {
+      email: t.string(),
+    },
+
+    optional: {
+      firstName: t.string(),
+      lastName: t.string(),
+      address: t.ref(() => AddressType),
+    },
+  })
+)

? write: (y/N)
```

# Type Walking

Notice that the above example also creates an `AddressType` validator for the `Address` type, since `Address` is used in the `User` type. `gen-typed-validators` will walk all the dependent
types, even if they're imported. For example:

```ts
// Address.ts

export type Address = {
  line1: string
  line2?: string
  city: string
  zipCode: string
}

// User.ts

import { Address } from './Address'

export type User = {
  email: string
  firstName?: string
  lastName?: string
  address?: Address
}

export const UserType: t.TypeAlias<User> = null
```

```diff
$ gen-typed-validators User.ts

/Users/andy/github/typed-validators-codemods/Address.ts
======================================

+ modified - original

@@ -1,6 +1,22 @@
+import * as t from 'typed-validators'
 export type Address = {
   line1: string
   line2?: string
   city: string
   zipCode: string
 }
+
+export const AddressType: t.TypeAlias<Address> = t.alias(
+  'Address',
+  t.object({
+    required: {
+      line1: t.string(),
+      city: t.string(),
+      zipCode: t.string(),
+    },
+
+    optional: {
+      line2: t.string(),
+    },
+  })
+)



/Users/andy/github/typed-validators-codemods/User.ts
======================================

+ modified - original

@@ -1,10 +1,25 @@
-import { Address } from './Address'
+import { Address, AddressType } from './Address'

+import * as t from 'typed-validators'
+
 export type User = {
   email: string
   firstName?: string
   lastName?: string
   address?: Address
 }

-export const UserType: t.TypeAlias<User> = null
+export const UserType: t.TypeAlias<User> = t.alias(
+  'User',
+  t.object({
+    required: {
+      email: t.string(),
+    },
+
+    optional: {
+      firstName: t.string(),
+      lastName: t.string(),
+      address: t.ref(() => AddressType),
+    },
+  })
+)

? write: (y/N)
```

# Limitations

- Definitely not all types are supported. The goal will always be to support a subset of types that can be reliably validated at runtime.

  Supported types:

  - All primitive values
  - `any`
  - `unknown`/`mixed`
  - Arrays
  - Tuples
  - Unions (`|`)
  - Intersections (`&`)
  - Objects or interfaces without indexers or methods
    - Flow exception: only a single indexer, to indicate a record type (`{ [string]: number }`)
    - TS execption: indexers to allow additional properties
      - `{ foo: number, [string]: any }`
      - `{ foo: number, [string]: unknown }`
      - `{ foo: number, [string | symbol]: any }`
      - `{ foo: number, [string | symbol]: unknown }`
      - `{ foo: number, [any]: any }`
      - `{ foo: number, [any]: unknown }`
  - TS `Record` types
  - Interface `extends`
  - Flow exact and inexact object types
  - Flow object type spread `{| foo: number, ...Bar |}`, `{ foo: number, ...$Exact<Bar>, ... }`
  - Class instance types
  - Type aliases
  - Readonly types are converted as-is (but not enforced at runtime, since readonly is strictly a compile-time hint):
    - TS `readonly`
    - Flow `$ReadOnly`
    - Flow `$ReadOnlyArray`

- Right now the generated validator name is `${typeName}Type` and this isn't customizable. In the future I could change it to infer from the starting validator declaration(s).
- Imports from `node_modules` aren't currently supported. It may be possible in the future when a package already contains generated validators, and it can find them along with
  the types in `.d.ts` or `.js.flow` files.

# CLI

```
gen-typed-validators <files>

Options:
      --version  Show version number                                   [boolean]
  -q, --quiet    reduce output                                         [boolean]
  -w, --write    write without asking for confirmation                 [boolean]
  -c, --check    check that all validators match types                 [boolean]
      --help     Show help                                             [boolean]
```

Without the `-w` or `-c` option, it will print a diff for any changes it would make, and ask if you want to write the changes.
