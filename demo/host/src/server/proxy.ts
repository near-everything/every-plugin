export async function proxyRequest(
	req: Request,
	targetBase: string,
	rewriteCookies = false,
): Promise<Response> {
	const url = new URL(req.url);
	const targetUrl = `${targetBase}${url.pathname}${url.search}`;

	const headers = new Headers(req.headers);
	headers.delete("host");
	headers.set("accept-encoding", "identity");

	if (rewriteCookies) {
		const cookieHeader = headers.get("cookie");
		if (cookieHeader) {
			const rewrittenCookies = cookieHeader.replace(
				/\bbetter-auth\./g,
				"__Secure-better-auth.",
			);
			headers.set("cookie", rewrittenCookies);
		}
	}

	const proxyReq = new Request(targetUrl, {
		method: req.method,
		headers,
		body: req.body,
		// Required for Node fetch to forward streaming bodies.
		duplex: "half",
	} as RequestInit);

	const response = await fetch(proxyReq);

	const responseHeaders = new Headers(response.headers);
	responseHeaders.delete("content-encoding");
	responseHeaders.delete("content-length");

	if (rewriteCookies) {
		responseHeaders.delete("set-cookie");
		const setCookies =
			typeof (response.headers as any).getSetCookie === "function"
				? (response.headers as any).getSetCookie()
				: (response.headers
						.get("set-cookie")
						?.split(/,(?=\s*(?:__Secure-|__Host-)?\w+=)/) ?? []);
		for (const cookie of setCookies) {
			const rewritten = cookie
				.replace(/^(__Secure-|__Host-)/i, "")
				.replace(/;\s*Domain=[^;]*/gi, "")
				.replace(/;\s*Secure/gi, "");
			responseHeaders.append("set-cookie", rewritten);
		}
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: responseHeaders,
	});
}
