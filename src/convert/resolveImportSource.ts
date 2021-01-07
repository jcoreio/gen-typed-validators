import * as t from '@babel/types'
import { NodePath } from '@babel/traverse'
import NodeConversionError from '../NodeConversionError'
import * as Path from 'path'

type Resolve = (file: string, options: { basedir: string }) => Promise<string>

export default async function resolveImportSource(
  resolve: Resolve,
  file: string,
  declaration:
    | NodePath<t.ImportDeclaration>
    | NodePath<t.ExportNamedDeclaration>
): Promise<string> {
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
  return await resolve(source, { basedir: Path.dirname(file) })
}
