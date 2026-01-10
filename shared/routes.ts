import { z } from 'zod';
import { 
  insertUserSchema, 
  users, 
  products, 
  insertProductSchema,
  insertClickSchema
} from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
};

export const api = {
  user: {
    get: {
      method: 'GET' as const,
      path: '/api/user',
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.unauthorized,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/user',
      input: insertUserSchema.partial(),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.unauthorized,
        400: errorSchemas.validation,
      },
    },
  },
  drops: {
    list: {
      method: 'GET' as const,
      path: '/api/drops',
      input: z.object({
        country: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof products.$inferSelect>()),
      },
    },
  },
  products: {
    get: {
      method: 'GET' as const,
      path: '/api/products/:id',
      responses: {
        200: z.any(), // Returns ProductWithDetails (complex type)
        404: errorSchemas.notFound,
      },
    },
  },
  clicks: {
    track: {
      method: 'POST' as const,
      path: '/api/clicks',
      input: insertClickSchema,
      responses: {
        201: z.object({ success: z.boolean() }),
        400: errorSchemas.validation,
      },
    },
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
