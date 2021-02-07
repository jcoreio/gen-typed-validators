import * as t from '@babel/types'
import template from '@babel/template'
import { FileConversionContext } from './ConversionContext'
import NodeConversionError from '../NodeConversionError'
import { NodePath } from '@babel/traverse'

const templates = {
  record: template.expression`T.record(KEY, VALUE)`,
}

export function isTSRecordType(path: NodePath<t.TSTypeReference>): boolean {
  const ref = path.node
  const { typeName } = ref
  return typeName.type === 'Identifier' && typeName.name === 'Record'
}

export default async function convertTSRecordType(
  context: FileConversionContext,
  path: NodePath<t.TSTypeReference>
): Promise<t.Expression> {
  if (!isTSRecordType(path)) {
    throw new NodeConversionError(
      `must be called with a path to a Record type annotation`,
      context.file,
      path
    )
  }
  const _typeParameters = path.get('typeParameters')
  if (!_typeParameters.node) {
    throw new NodeConversionError(
      `Record is missing type parameters`,
      context.file,
      path
    )
  }
  const typeParameters: NodePath<t.TypeParameterInstantiation> = _typeParameters as any
  const [key, value] = typeParameters.get('params')
  if (!key)
    throw new NodeConversionError(
      `Record is missing key type`,
      context.file,
      path
    )
  if (!value)
    throw new NodeConversionError(
      `Record is missing value type`,
      context.file,
      path
    )
  return templates.record({
    T: await context.importT(),
    KEY: await context.convert(key),
    VALUE: await context.convert(value),
  })
}
