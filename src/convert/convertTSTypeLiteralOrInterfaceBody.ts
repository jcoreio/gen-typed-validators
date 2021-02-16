import * as t from '@babel/types'
import template from '@babel/template'
import { FileConversionContext } from './ConversionContext'
import NodeConversionError from '../NodeConversionError'
import { NodePath } from '@babel/traverse'
import isInexactIndexer from './isInexactIndexer'

const templates = {
  object: template.expression`T.object(PROPS)`,
}

export default async function convertTSTypeLiteralOrInterfaceBody(
  context: FileConversionContext,
  path: NodePath<t.TSTypeLiteral> | NodePath<t.TSInterfaceBody>
): Promise<t.Expression> {
  const required: t.ObjectProperty[] = []
  const optional: t.ObjectProperty[] = []
  let inexact: boolean | undefined
  for (const _property of path.isTSTypeLiteral()
    ? path.get('members')
    : path.get('body')) {
    if (_property.isTSIndexSignature()) {
      const property: NodePath<t.TSIndexSignature> = _property
      if (inexact != null || !isInexactIndexer(property.node))
        throw new NodeConversionError(
          `Unsupported object property`,
          context.file,
          property
        )
      inexact = true
      continue
    }
    if (!_property.isTSPropertySignature()) {
      throw new NodeConversionError(
        `Unsupported object property`,
        context.file,
        _property
      )
    }
    const property: NodePath<t.TSPropertySignature> = _property
    const key = property.get('key')
    const typeAnnotation = property.get('typeAnnotation')
    if (!key.isLiteral() && !key.isIdentifier()) {
      throw new NodeConversionError(`Unsupported key type`, context.file, key)
    }
    if (!typeAnnotation.isTSTypeAnnotation()) {
      throw new NodeConversionError(
        `Property is missing type annotation`,
        context.file,
        property
      )
    }
    const converted = t.objectProperty(
      key.node,
      await context.convert(
        (typeAnnotation as NodePath<t.TSTypeAnnotation>).get('typeAnnotation')
      )
    )
    if (property.node.computed) converted.computed = true
    if (property.node.optional) optional.push(converted)
    else required.push(converted)
  }
  if (!inexact && !optional.length) {
    return templates.object({
      T: await context.importT(),
      PROPS: t.objectExpression(required),
    })
  }
  const props: t.ObjectProperty[] = []
  if (inexact) {
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
