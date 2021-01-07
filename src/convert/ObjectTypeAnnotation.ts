import * as t from '@babel/types'
import template from '@babel/template'
import { FileConversionContext } from './index'
import NodeConversionError from '../NodeConversionError'
import { NodePath } from '@babel/traverse'

const templates = {
  record: template.expression`T.record(KEY, VALUE)`,
  object: template.expression`T.object(PROPS)`,
}

export default async function convertObjectTypeAnnotation(
  context: FileConversionContext,
  path: NodePath<t.ObjectTypeAnnotation>
): Promise<t.Expression> {
  const obj = path.node
  const properties = path.get('properties')
  const indexers = path.get('indexers') as NodePath<t.ObjectTypeIndexer>[]
  const exact = !obj.exact && !obj.inexact ? context.defaultExact : obj.exact
  if (properties.length === 0 && indexers?.length === 1) {
    const [indexer] = indexers
    return templates.record({
      T: await context.importT(),
      KEY: await context.convert(indexer.get('key')),
      VALUE: await context.convert(indexer.get('value')),
    })
  }
  if (indexers?.length) {
    if (properties.length) {
      throw new NodeConversionError(
        `Properties mixed with indexers aren't supported`,
        context.file,
        indexers[0]
      )
    } else {
      throw new NodeConversionError(
        `Multiple indexers aren't supported`,
        context.file,
        indexers[1]
      )
    }
  }
  const required: t.ObjectProperty[] = []
  const optional: t.ObjectProperty[] = []
  for (const _property of properties) {
    if (!_property.isObjectTypeProperty()) {
      throw new NodeConversionError(
        `Unsupported object property`,
        context.file,
        _property
      )
    }
    const property: NodePath<t.ObjectTypeProperty> = _property
    const { key, optional: isOptional } = property.node
    const value = property.get('value')
    const converted = t.objectProperty(key, await context.convert(value))
    if (isOptional) optional.push(converted)
    else required.push(converted)
  }
  if (exact && !optional.length) {
    return templates.object({
      T: await context.importT(),
      PROPS: t.objectExpression(required),
    })
  }
  const props: t.ObjectProperty[] = []
  if (!exact) {
    props.push(t.objectProperty(t.identifier('exact'), t.booleanLiteral(false)))
  }
  if (required.length) {
    props.push(
      t.objectProperty(t.identifier('required'), t.objectExpression(required))
    )
  }
  if (optional.length) {
    props.push(
      t.objectProperty(t.identifier('optional'), t.objectExpression(optional))
    )
  }
  return templates.object({
    T: await context.importT(),
    PROPS: t.objectExpression(props),
  })
}
