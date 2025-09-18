import * as fs from 'fs';
import * as path from 'path';
import SwaggerParser from '@apidevtools/swagger-parser';
import { OpenAPIV3 } from 'openapi-types';

function resolveRef(ref: string, api: OpenAPIV3.Document): OpenAPIV3.SchemaObject | null {
  const parts = ref.split('/').slice(1); // Remove leading '#'
  let current: any = api;
  for (const part of parts) {
    current = current[part];
    if (current === undefined) return null;
  }
  return current as OpenAPIV3.SchemaObject;
}

export async function generateClient(input: string, outputDir: string): Promise<void> {
  // 读取和解析 OpenAPI 定义
  const api = await loadOpenAPIDefinition(input);

  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 生成客户端代码
  await generateClientCode(api, outputDir);
}

async function loadOpenAPIDefinition(input: string): Promise<OpenAPIV3.Document> {
  if (input.startsWith('http://') || input.startsWith('https://')) {
    // 从 URL 加载
    return await SwaggerParser.parse(input) as OpenAPIV3.Document;
  } else {
    // 从本地文件加载
    const content = fs.readFileSync(input, 'utf-8');
    return await SwaggerParser.parse(JSON.parse(content)) as OpenAPIV3.Document;
  }
}

async function generateClientCode(api: OpenAPIV3.Document, outputDir: string): Promise<void> {
  // 生成全局类型文件
  const typesFilePath = path.join(outputDir, 'types.ts');
  const typesContent = generateGlobalTypes(api);
  fs.writeFileSync(typesFilePath, typesContent, 'utf-8');

  // 按 tag 分组接口，支持所有 HTTP 方法
  const tagGroups: Record<string, { operation: OpenAPIV3.OperationObject; path: string; method: string }[]> = {};

  for (const [pathName, pathItem] of Object.entries(api.paths)) {
    if (pathItem) {
      const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace'] as const;
      for (const method of methods) {
        const operation = pathItem[method];
        if (operation) {
          const tags = operation.tags || ['default'];
          for (const tag of tags) {
            if (!tagGroups[tag]) {
              tagGroups[tag] = [];
            }
            tagGroups[tag].push({ operation, path: pathName, method });
          }
        }
      }
    }
  }

  // 为每个 tag 生成文件
  for (const [tag, operations] of Object.entries(tagGroups)) {
    const fileName = `${tag}.ts`;
    const filePath = path.join(outputDir, fileName);
    const content = generateTagFile(tag, operations, api);
    fs.writeFileSync(filePath, content, 'utf-8');
  }
}

function generateTagFile(tag: string, operations: { operation: OpenAPIV3.OperationObject; path: string; method: string }[], api: OpenAPIV3.Document): string {
  let content = `import { request } from './request';\nimport * as ApiType from './types';\n\n`;

  // 生成内联类型定义
  const inlineTypes = generateInlineTypes(operations, api);
  content += inlineTypes + '\n';

  // 生成方法
  for (const item of operations) {
    const methodCode = generateMethod(item, api);
    content += methodCode + '\n';
  }

  return content;
}

function generateTypes(operations: { operation: OpenAPIV3.OperationObject; path: string }[], api: OpenAPIV3.Document): string {
  const types: string[] = [];

  for (const { operation } of operations) {
    // 请求类型
    if (operation.requestBody) {
      const requestBody = operation.requestBody as OpenAPIV3.RequestBodyObject;
      const jsonContent = requestBody.content?.['application/json'];
      if (jsonContent?.schema) {
        const typeName = `${toPascalCase(operation.operationId || operation.summary || 'Request')}Request`;
        const typeDef = generateTypeFromSchema(jsonContent.schema, typeName, api);
        types.push(typeDef);
      }
    }

    // 响应类型
    if (operation.responses) {
      const successResponse = operation.responses['200'] as OpenAPIV3.ResponseObject;
      if (successResponse?.content?.['application/json']?.schema) {
        const typeName = `${toPascalCase(operation.operationId || operation.summary || 'Response')}Response`;
        const typeDef = generateTypeFromSchema(successResponse.content['application/json'].schema, typeName, api);
        types.push(typeDef);
      }
    }
  }

  return types.join('\n\n');
}

function generateTypeFromSchema(schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject, typeName: string, api: OpenAPIV3.Document, isGlobalType: boolean = false): string {
  if ('$ref' in schema) {
    // 解析引用类型
    const resolvedSchema = resolveRef(schema.$ref, api);
    if (resolvedSchema) {
      return generateTypeFromSchema(resolvedSchema, typeName, api, isGlobalType);
    }
    return `export type ${typeName} = any; // Unable to resolve ref: ${schema.$ref}`;
  }

  if (schema.type === 'object' && schema.properties) {
    const properties = Object.entries(schema.properties).map(([key, propSchema]) => {
      const propType = getTypeFromSchema(propSchema, api, isGlobalType);
      const optional = !schema.required?.includes(key) ? '?' : '';
      return `  ${key}${optional}: ${propType};`;
    }).join('\n');
    return `export interface ${typeName} {\n${properties}\n}`;
  }

  if (schema.type === 'array' && schema.items) {
    const itemType = getTypeFromSchema(schema.items, api, isGlobalType);
    return `export type ${typeName} = ${itemType}[];`;
  }

  // 其他类型
  const type = getTypeFromSchema(schema, api, isGlobalType);
  return `export type ${typeName} = ${type};`;
}

function getTypeFromSchema(schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject, api: OpenAPIV3.Document, isGlobalType: boolean = false): string {
  if ('$ref' in schema) {
    const ref = schema.$ref;
    const refName = ref.split('/').pop() || 'any';
    return isGlobalType ? refName : `ApiType.${refName}`;
  }

  const s = schema as OpenAPIV3.SchemaObject;

  // 处理 anyOf
  if (s.anyOf) {
    const types = s.anyOf.map(subSchema => getTypeFromSchema(subSchema, api, isGlobalType));
    return types.join(' | ');
  }

  switch (s.type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      if (s.items) {
        return `${getTypeFromSchema(s.items, api, isGlobalType)}[]`;
      }
      return 'any[]';
    case 'object':
      return 'any'; // 简化
    default:
      return 'any';
  }
}

function toPascalCase(str: string): string {
  return str.replace(/(^\w|-\w)/g, (match) => match.replace('-', '').toUpperCase());
}

function generateMethod(item: { operation: OpenAPIV3.OperationObject; path: string; method: string }, api: OpenAPIV3.Document): string {
  const { operation, path: pathName, method: httpMethod } = item;
  const operationId = operation.operationId || operation.summary || 'unknown';
  const methodName = toCamelCase(operationId);

  // 请求类型
  let requestType = 'any';
  let isRefRequestType = false;
  if (operation.requestBody) {
    const requestBody = operation.requestBody as OpenAPIV3.RequestBodyObject;
    const jsonContent = requestBody.content?.['application/json'];
    if (jsonContent?.schema) {
      if ('$ref' in jsonContent.schema) {
        const refName = jsonContent.schema.$ref.split('/').pop() || 'any';
        requestType = `ApiType.${refName}`;
        isRefRequestType = true;
      } else {
        requestType = `${toPascalCase(operationId)}Request`;
      }
    }
  }

  // 响应类型
  let responseType = 'any';
  let isRefResponseType = false;
  if (operation.responses?.['200']) {
    const successResponse = operation.responses['200'] as OpenAPIV3.ResponseObject;
    if (successResponse.content?.['application/json']?.schema) {
      const schema = successResponse.content['application/json'].schema;
      if ('$ref' in schema) {
        const refName = schema.$ref.split('/').pop() || 'any';
        responseType = `ApiType.${refName}`;
        isRefResponseType = true;
      } else {
        responseType = `${toPascalCase(operationId)}Response`;
      }
    }
  }

  // URL
  const url = pathName;

  const httpMethodUpper = httpMethod.toUpperCase();
  const dataParam = httpMethodUpper === 'GET' || httpMethodUpper === 'DELETE' ? '' : 'data';

  return `export async function ${methodName}(${dataParam ? `data: ${requestType}` : ''}): Promise<${responseType}> {
  return request('${url}', '${httpMethodUpper}', ${dataParam || 'undefined'});
}`;
}

function toCamelCase(str: string): string {
  return str.replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '');
}

function generateGlobalTypes(api: OpenAPIV3.Document): string {
  let content = '';

  if (api.components?.schemas) {
    for (const [schemaName, schema] of Object.entries(api.components.schemas)) {
      const typeDef = generateTypeFromSchema(schema, schemaName, api, true);
      content += typeDef + '\n\n';
    }
  }

  return content;
}

function generateInlineTypes(operations: { operation: OpenAPIV3.OperationObject; path: string; method: string }[], api: OpenAPIV3.Document): string {
  let content = '';

  for (const { operation } of operations) {
    const operationId = operation.operationId || operation.summary || 'unknown';

    // 请求类型
    if (operation.requestBody) {
      const requestBody = operation.requestBody as OpenAPIV3.RequestBodyObject;
      const jsonContent = requestBody.content?.['application/json'];
      if (jsonContent?.schema && !('$ref' in jsonContent.schema)) {
        const typeName = `${toPascalCase(operationId)}Request`;
        const typeDef = generateTypeFromSchema(jsonContent.schema, typeName, api);
        content += typeDef + '\n\n';
      }
    }

    // 响应类型
    if (operation.responses?.['200']) {
      const successResponse = operation.responses['200'] as OpenAPIV3.ResponseObject;
      if (successResponse.content?.['application/json']?.schema && !('$ref' in successResponse.content['application/json'].schema)) {
        const typeName = `${toPascalCase(operationId)}Response`;
        const typeDef = generateTypeFromSchema(successResponse.content['application/json'].schema, typeName, api);
        content += typeDef + '\n\n';
      }
    }
  }

  return content;
}