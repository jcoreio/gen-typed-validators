import * as t from '@babel/types'
import { NodePath } from '@babel/traverse'
import NodeConversionError from '../NodeConversionError'
import * as Path from 'path'

export default function resolveImportSource(
  file: string,
  declaration:
    | NodePath<t.ImportDeclaration>
    | NodePath<t.ExportNamedDeclaration>
): string {
  const source = declaration.node.source?.value
  if (!source) {
    throw new Error(`expected node to have source`)
  }
  if (!source.startsWith('.')) {
    throw new NodeConversionError(
      `References to types or classes imported from dependencies are not currently supported`,
      file,
      declaration
    )
  }
  return Path.resolve(Path.dirname(file), source)
}
