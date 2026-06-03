import CryptoJS from 'crypto-js';

interface CookieItem {
	name: string;
	value: string;
	domain: string;
	path: string;
	sameSite: string;
	[key: string]: unknown;
}

// Define Env to include expected environment variables
interface Env {
	COOKIE_SERVER_HOST: string;
	COOKIE_SERVER_ACCOUNT_UUID: string;
	COOKIE_SERVER_ACCOUNT_PASSWORD: string;
	COOKIE_SERVER_CRYPTO_TYPE?: string;
}

interface DecryptResult {
	cookie_data: Record<string, CookieItem[]>;
	local_storage_data: Record<string, unknown>;
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		const host = env.COOKIE_SERVER_HOST;
		const uuid = env.COOKIE_SERVER_ACCOUNT_UUID;
		const password = env.COOKIE_SERVER_ACCOUNT_PASSWORD;
		const crypto_type = env.COOKIE_SERVER_CRYPTO_TYPE;
		// 路由: /api/v1/qqmail_head/{email}

		if (url.pathname.startsWith('/api/v1/qqmail_head/')) {
			const head_email = decodeURIComponent(url.pathname.replace('/api/v1/qqmail_head/', ''));
			// 验证有效性
			if (head_email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) === null) {
				return Response.json({ error: 'Invalid email format' }, { status: 400 });
			}
			console.log(head_email);

			const cache = caches.default;

			try {
				const cookies = await cloud_cookie(host, uuid, password, crypto_type);
				// 筛选mail.qq.com域下的cookie
				const mail_cookies = cookies.filter(cookie => cookie.domain === '.mail.qq.com');
				const url = `https://wx.mail.qq.com/info/geticon?addr=${encodeURIComponent(head_email)}&type=0`;
				console.log(url);

				const cacheKey = new Request(url);
				let response: Response | undefined = await cache.match(cacheKey) as Response;
				if (response) {
					console.log(`[Image] Cache hit for ${url}`);
				} else {
					const originRes = await fetch(url, {
						headers: {
							Cookie: mail_cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
						}
					});
					console.log(`[Image] Cache miss for ${url}`);

					if (!originRes.ok) {
						return Response.json({ error: `Failed to fetch image`, code: originRes.status }, { status: originRes.status });
					}

					// 必须设置 Cache-Control 头部，否则 cache.put 会静默失败
					const headers = new Headers(originRes.headers);
					headers.delete('strict-transport-security');
					headers.delete('mmlas-verifyresult');
					headers.set('Cache-Control', 'max-age=2592000'); // 缓存一个月
					response = new Response(originRes.clone().body, {
						status: originRes.status,
						statusText: originRes.statusText,
						headers,
					});
					await cache.put(cacheKey, response.clone());
					response = new Response(originRes.body, {
						status: originRes.status,
						statusText: originRes.statusText,
						headers,
					});
				}

				return response;
			} catch (e) {
				return Response.json({ error: (e as Error).message }, { status: 500 });
			}
		}

		return new Response("Hello World!");
	},
} satisfies ExportedHandler<Env>;

async function cloud_cookie(host: string, uuid: string, password: string, crypto_type: any): Promise<CookieItem[]> {
	const url = new URL(`/get/${uuid}`, host);

	// console.log(`Fetching cookie from ${url.toString()} with crypto_type=${crypto_type}`);
	// 如果指定了加密算法，添加查询参数
	if (crypto_type && crypto_type !== 'legacy') {
		url.searchParams.set('crypto_type', crypto_type);
	}

	// 缓存
	const cache = caches.default;

	const cacheKey = new Request(url.toString());
	let ret: Response | undefined = await cache.match(cacheKey) as Response;
	if (ret) {
		console.log(`[Cookies] Cache hit for ${url.toString()}`);
	} else {
		const originRes = await fetch(url.toString());
		console.log(`[Cookies] Cache miss for ${url.toString()}`);
		// 必须设置 Cache-Control 头部，否则 cache.put 会静默失败
		const headers = new Headers(originRes.headers);
		headers.set('Cache-Control', 'max-age=3600'); // 缓存一小时
		ret = new Response(originRes.clone().body, {
			status: originRes.status,
			statusText: originRes.statusText,
			headers,
		});
		await cache.put(cacheKey, ret.clone());
		ret = new Response(originRes.body, {
			status: originRes.status,
			statusText: originRes.statusText,
			headers,
		});
	}

	const json = await ret.json() as { encrypted?: string; crypto_type?: string };
	const cookies: CookieItem[] = [];
	if (json && json.encrypted) {
		// 优先使用参数指定的算法，其次使用服务器返回的算法，最后使用legacy
		const useCryptoType = crypto_type || json.crypto_type || 'legacy';
		const { cookie_data } = cookie_decrypt(uuid, json.encrypted, password, useCryptoType);
		for (const key in cookie_data) {
			// merge cookie_data[key] to cookies
			cookies.push(...cookie_data[key].map(item => {
				if (item.sameSite === 'unspecified') item.sameSite = 'Lax';
				return item;
			}));
		}
	}
	return cookies;
}

function cookie_decrypt(uuid: string, encrypted: string, password: string, crypto_type: any): DecryptResult {
	const hash = CryptoJS.MD5(uuid + '-' + password).toString();
	const the_key = hash.substring(0, 16);

	if (crypto_type === 'aes-128-cbc-fixed') {
		// 新的标准 AES-128-CBC 算法，使用固定 IV
		const fixedIv = CryptoJS.enc.Hex.parse('00000000000000000000000000000000'); // 16字节的0
		const options = {
			iv: fixedIv,
			mode: CryptoJS.mode.CBC,
			padding: CryptoJS.pad.Pkcs7
		};
		// 直接解密原始加密数据
		const decrypted = CryptoJS.AES.decrypt(encrypted, CryptoJS.enc.Utf8.parse(the_key), options).toString(CryptoJS.enc.Utf8);
		const parsed: DecryptResult = JSON.parse(decrypted);
		return parsed;
	} else {
		// 原有的 legacy 算法
		const decrypted = CryptoJS.AES.decrypt(encrypted, the_key).toString(CryptoJS.enc.Utf8);
		const parsed: DecryptResult = JSON.parse(decrypted);
		return parsed;
	}
}
