// webhook.ts
import { createHmac, timingSafeEqual } from "crypto";

const SECRET = '2ba4faf8-dcf9-4055-a1df-eea1966c';
if (!SECRET) {
	console.error("Ошибка: задайте TRIBUTE_API_KEY в окружении");
	// не выходим — Bun всё равно поднимет сервер, но обработчик будет отвергать запросы
}

const PORT = 3041; // как просили

type TributeEvent = {
	name?: string;
	payload?: any;
	// в реале могут быть и другие поля — расширяйте по необходимости
};

function bufferFromUint8(u8: Uint8Array) {
	return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
}

function safeCompare(a: Buffer, b: Buffer) {
	try {
		if (a.length !== b.length) return false;
		return timingSafeEqual(a, b);
	} catch {
		return false;
	}
}

/**
 * Проверяем подпись trbt-signature.
 * Подпись может быть hex или base64. Также поддерживаем префикс "sha256=".
 */
function verifySignature(headerSig: string | null, secret: string, raw: Uint8Array) {
	if (!headerSig) return false;
	const rawBuf = bufferFromUint8(raw);

	const hmac = createHmac("sha256", secret).update(rawBuf).digest(); // Buffer

	const hex = hmac.toString("hex");
	const b64 = hmac.toString("base64");

	// очистим заголовок от возможного префикса like "sha256="
	const headerClean = headerSig.replace(/^sha256=/i, "").trim();

	const headerBuf = Buffer.from(headerClean, "utf8"); // сначала сравним как utf8 (маловероятно совпадёт)
	if (safeCompare(headerBuf, Buffer.from(hex, "utf8"))) {
		// совпало по текстовому представлению hex (редко)
		return safeCompare(Buffer.from(headerClean, "utf8"), Buffer.from(hex, "utf8"));
	}

	// сравниваем raw header bytes с hex и base64
	try {
		// если header содержит hex (только 0-9a-f)
		if (/^[0-9a-fA-F]+$/.test(headerClean)) {
			const headerAsBuf = Buffer.from(headerClean, "hex");
			if (safeCompare(headerAsBuf, hmac)) return true;
		}
	} catch {
		// ignore
	}

	try {
		// попробуем base64
		const headerAsBufB64 = Buffer.from(headerClean, "base64");
		if (safeCompare(headerAsBufB64, hmac)) return true;
	} catch {
		// ignore
	}

	// дополнительные попытки: сравнить header string with hex / base64 strings in constant-time way
	if (safeCompare(Buffer.from(headerClean, "utf8"), Buffer.from(hex, "utf8"))) return true;
	if (safeCompare(Buffer.from(headerClean, "utf8"), Buffer.from(b64, "utf8"))) return true;

	return false;
}

/** Простая обработка покупки цифрового товара — замените на вашу логику. */
async function handleNewDigitalProduct(payload: any) {
	// пример payload: { product_id, amount, currency, user_id, telegram_user_id, ... }
	console.log("handleNewDigitalProduct payload:", payload);

	// возвращаем пример ответа — Tribute обычно ожидает 200 OK
	return { ok: true };
}

Bun.serve({
	port: PORT,
	routes: {
		"/wh": async (req: Request) => {
			try {
				// получаем сырое тело в виде Uint8Array (важно для проверки подписи)
				const ab = await req.arrayBuffer();
				const raw = new Uint8Array(ab);

				const sig = req.headers.get("trbt-signature") ?? req.headers.get("Trbt-Signature");
				if (!SECRET) {
					console.warn("TRIBUTE_API_KEY не задан, отвергаем подпись.");
					return new Response(JSON.stringify({ error: "server not configured" }), {
						status: 500,
						headers: { "content-type": "application/json" },
					});
				}

				if (!verifySignature(sig, SECRET, raw)) {
					console.warn("Неверная подпись:", sig);
					return new Response(JSON.stringify({ error: "invalid signature" }), {
						status: 401,
						headers: { "content-type": "application/json" },
					});
				}

				// безопасно распарсим JSON из сырого тела
				const bodyText = new TextDecoder().decode(raw);
				let event: TributeEvent | null = null;
				try {
					event = JSON.parse(bodyText) as TributeEvent;
				} catch (err) {
					console.warn("Invalid JSON:", err);
					return new Response(JSON.stringify({ error: "invalid json" }), {
						status: 400,
						headers: { "content-type": "application/json" },
					});
				}

				console.log("Получено событие tribute:", event?.name);

				if (event?.name === "new_digital_product") {
					try {
						const res = await handleNewDigitalProduct(event.payload);
						return new Response(JSON.stringify(res), {
							status: 200,
							headers: { "content-type": "application/json" },
						});
					} catch (err) {
						console.error("Ошибка обработки new_digital_product:", err);
						return new Response(JSON.stringify({ error: "processing error" }), {
							status: 500,
							headers: { "content-type": "application/json" },
						});
					}
				}

				// если другое событие — логируем и возвращаем 200
				console.log("Unhandled event:", event?.name);
				return new Response(JSON.stringify({ ok: true, received: event?.name ?? null }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			} catch (err) {
				console.error("Unhandled error in /wh:", err);
				return new Response(JSON.stringify({ error: "internal error" }), {
					status: 500,
					headers: { "content-type": "application/json" },
				});
			}
		},
	},
});

console.log(`Webhook (TS) listening on http://0.0.0.0:${PORT}/wh`);
