type RequestMethod = "GET" | "POST" | "PUT" | "DELETE";

async function request<T>(url: string, method: RequestMethod, data?: any, headers?: Record<string, string>): Promise<T> {
    return fetch(url, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...headers
        },
        body: JSON.stringify(data)
    }).then(response => response.json());
}