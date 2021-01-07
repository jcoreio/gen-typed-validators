import * as t from '@babel/types'
import getKey from './getKey'

type Reference =
  | t.Identifier
  | t.StringLiteral
  | t.QualifiedTypeIdentifier
  | t.TSQualifiedName

export default function areReferencesEqual(
  a: Reference,
  b: Reference
): boolean {
  switch (a.type) {
    case 'Identifier':
    case 'StringLiteral':
      return (
        (b.type === 'Identifier' || b.type === 'StringLiteral') &&
        getKey(b) === getKey(a)
      )
    case 'QualifiedTypeIdentifier':
      return (
        b.type === 'QualifiedTypeIdentifier' &&
        areReferencesEqual(a.qualification, b.qualification) &&
        areReferencesEqual(a.id, b.id)
      )
    case 'TSQualifiedName':
      return (
        b.type === 'TSQualifiedName' &&
        areReferencesEqual(a.left, b.left) &&
        areReferencesEqual(a.right, b.right)
      )
  }
}
