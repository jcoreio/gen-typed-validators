import * as t from '@babel/types'
import template from '@babel/template'
import { FileConversionContext } from './ConversionContext'
import NodeConversionError from '../NodeConversionError'
import { NodePath } from '@babel/traverse'
import getExactArgument from './getExactArgument'

const templates = {
  record: template.expression`T.record(KEY, VALUE)`,
  object: template.expression`T.object(PROPS)`,
  merge: template.expression(`%%T%%.merge(%%OBJECTS%%)`),
  mergeInexact: template.expression(`%%T%%.mergeInexact(%%OBJECTS%%)`),
}

export default async function convertObjectTypeAnnotation(
  context: FileConversionContext,
  path: NodePath<t.ObjectTypeAnnotation>
): Promise<t.Expression> {
  const obj = path.node
  const properties: NodePath<t.ObjectTypeProperty>[] = []
  const spreads: NodePath<t.ObjectTypeSpreadProperty>[] = []
  for (const prop of path.get('properties')) {
    if (prop.isObjectTypeProperty()) properties.push(prop)
    if (prop.isObjectTypeSpreadProperty()) spreads.push(prop)
  }
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
  for (const property of properties) {
    const { key, optional: isOptional } = property.node
    const value = property.get('value')
    const converted = t.objectProperty(key, await context.convert(value))
    if (isOptional) optional.push(converted)
    else required.push(converted)
  }
  const convertedSpreads = spreads.length
    ? await Promise.all(
        spreads.map((spread: NodePath<t.ObjectTypeSpreadProperty>) =>
          context.convert(
            getExactArgument(context, spread.get('argument')) ||
              spread.get('argument')
          )
        )
      )
    : []
  let result: t.Expression
  if (exact && !optional.length) {
    result = templates.object({
      T: await context.importT(),
      PROPS: t.objectExpression(required),
    })
  } else {
    const props: t.ObjectProperty[] = []
    if (!exact) {
      props.push(
        t.objectProperty(t.identifier('exact'), t.booleanLiteral(false))
      )
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
    result = templates.object({
      T: await context.importT(),
      PROPS: t.objectExpression(props),
    })
  }
  if (convertedSpreads.length) {
    return (exact ? templates.merge : templates.mergeInexact)({
      T: await context.importT(),
      OBJECTS: properties.length
        ? [...convertedSpreads, result]
        : convertedSpreads,
    })
  }
  return result
}
