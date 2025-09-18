type RequestMethod = "GET" | "POST" | "PUT" | "DELETE";

// 定义请求选项接口
export interface RequestOptions {
  signal?: AbortSignal;
}

// 定义接口
export interface RequestInterface {
  request<T>(url: string, method: RequestMethod, data?: any, headers?: Record<string, string>, options?: RequestOptions): Promise<T>;
}

// 默认实现（使用 fetch）
const defaultRequestImpl: RequestInterface = {
  request: async <T>(url: string, method: RequestMethod, data?: any, headers?: Record<string, string>, options?: RequestOptions): Promise<T> => {
    return fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify(data),
      signal: options?.signal
    }).then(response => response.json());
  }
};

// 可替换的实现变量
export let requestImpl: RequestInterface = defaultRequestImpl;

// 导出的 request 函数，使用当前实现
export async function request<T>(url: string, method: RequestMethod, data?: any, headers?: Record<string, string>, options?: RequestOptions): Promise<T> {
  return requestImpl.request(url, method, data, headers, options);
}