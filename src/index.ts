import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { handle } from 'hono/vercel'
import * as fs from "fs";
import bs58 from 'bs58';
import TonWeb from "tonweb";
import { logger } from 'hono/logger'
import { HTTPException } from "hono/http-exception";
import { SafematrixAuthMpc, SafematrixAuthMultiMpc } from "@safematrix-auth/mpc";
import { getBytes, keccak256, ethers, hexlify, hashMessage } from "ethers";
const app = new Hono().basePath('/api')
const wasmBuffer = fs.readFileSync(__dirname + "/mpc_wasm_bg.wasm");
export const customLogger = (message: string, ...rest: string[]) => {
  const date = new Date().toString()
  console.log(`[${date}]`,message, ...rest)
}
app.use(logger(customLogger))

app.get('/', (c) => {
  return c.json({ message: "Congrats! You've deployed Hono to Vercel" })
});

/// Generate mpc share
/// query: t, n, engine (default: t=1, n=3, engine=ECDSA)
/// return: mpc shares
app.get("/generate", async (c) => {
  const query = c.req.query() as { t?: number; n?: number; engine?: string };
  const t = query.t ?? 1;
  const n = query?.n ?? 3;
  const engine = query?.engine ?? "ECDSA";
  const mpc = await SafematrixAuthMultiMpc.initialize({ wasm: wasmBuffer });
  const keys = await mpc.generate(t, n, engine);
  // @ts-ignore
  return c.json(keys);
});

/// Recover mpc share
/// body: keys, aux
/// return: mpc share
app.post("/recover", async (c) => {
  const body = await c.req.json();
  const keys = body.keys;
  if (!keys) {
    throw new HTTPException(400, { message: "keys is required" });
  }
  const aux = body.aux;
  if (!aux) {
    throw new HTTPException(400, { message: "aux is required" });
  }
  const mpc = await SafematrixAuthMultiMpc.initialize({ wasm: wasmBuffer });
  const keypairs = mpc.recover(keys, aux as string);
  // @ts-ignore
  return c.json(keypairs);
});

/// Get evm address
/// body: key (default: key={})
/// return: address
app.post("/address", async (c) => {
  const body = await c.req.json();
  const { key, chain } = body;
  if (!key) {
    throw new HTTPException(400, { message: "key is required" });
  }
  const mpc = await SafematrixAuthMultiMpc.initialize({ wasm: wasmBuffer });
  if (chain === 'ton') {
    // @ts-ignore
    const publicKey = key.pk;
    const WalletClass = new TonWeb().wallet.all['v4R2'];
    const wallet = new WalletClass(new TonWeb().provider, {
      publicKey: Buffer.from(publicKey.slice(2), 'hex'),
      wc: 0
    });
    const walletAddress = await wallet.getAddress();
    const address = walletAddress.toString(true, true, true);
    return c.text(address);
  }
  const address = mpc.address(key, "ECDSA");
  return c.text(address);
});

/// Sign message with mpc shares
/// body: message, keys, t, isTx (default: message=hello world, keys=[], t=1, isTx=true)
/// isTx to sign a transaction
/// return: signature
app.post("/sign", async (c) => {
  const body = await c.req.json();
  let rawMessage = body.message;
  const engine = body.engine ?? 'ECDSA'
  let isTx = body.isTx ?? true
  if (!rawMessage) {
    throw new HTTPException(400, { message: "message is required" });
  }
  /// if sign transaction hash the transaction bytes
  /// if sign message, use hashMessage
  let message
  if (engine === 'ECDSA') {
    message = isTx ? keccak256(rawMessage) : hashMessage(
      rawMessage.startsWith("0x") ? getBytes(rawMessage) : (rawMessage as string)
    );
  }
  const msgs = [getBytes(message as string)];
  const keys = body.keys;
  if (!keys) {
    throw new HTTPException(400, { message: "keys is required" });
  }
  const mpc = await SafematrixAuthMultiMpc.initialize({ wasm: wasmBuffer });
  const sigs = await mpc.localSign(
    {
      msgs,
      t: 1,
      keys,
    },
    engine
  );
  if (engine === 'EDDSA') {
    return c.text(
      hexlify(Uint8Array.from(sigs[0]))
    )
  }
  const sig = ethers.Signature.from(
    hexlify(Uint8Array.from(sigs[0]))
  ).serialized;
  return c.text(
    sig
  );
});

app.post("/sk", async (c) => {
  const body = await c.req.json();
  const engine = body.engine ?? 'ECDSA'
  const keys = body.keys
  const mpc = await SafematrixAuthMultiMpc.initialize({ wasm: wasmBuffer });
  const sk = mpc.secretKey(keys, engine)
  if (engine === 'EDDSA') {
    return c.text('0x' + Buffer.from(bs58.decode(sk).subarray(0, 32)).toString('hex'))
  }
  return c.text(sk)
})

/// Generate local mpc share
/// query: t, n, engine (default: t=1, n=3, engine=ECDSA)
/// return: mpc shares
app.get("/generate_local", async (c) => {
  const query = c.req.query() as { t?: number; n?: number; engine?: string };
  const t = query.t ?? 1;
  const n = query?.n ?? 3;
  const engine = query?.engine ?? "ECDSA";
  const mpc = await SafematrixAuthMpc.initialize({ wasm: wasmBuffer });
  const keys = mpc.generate(t, n, engine);
  // @ts-ignore
  return c.json(keys);
});

/// Get evm address
/// body: key (default: key={})
/// return: address
app.post("/address_local", async (c) => {
  const body = await c.req.json();
  const engine = body.engine ?? 'ECDSA'
  const { key, chain } = body;
  if (!key) {
    throw new HTTPException(400, { message: "key is required" });
  }
  const mpc = await SafematrixAuthMpc.initialize({ wasm: wasmBuffer });
  const address = mpc.address(key, engine)
  return c.text(address);
});

app.post("/sk_local", async (c) => {
  const body = await c.req.json();
  const engine = body.engine ?? 'ECDSA'
  const keys = body.keys
  const mpc = await SafematrixAuthMpc.initialize({ wasm: wasmBuffer });
  const sk = mpc.secretKey(keys, engine)
  if (engine === 'EDDSA') {
    return c.text('0x' + Buffer.from(bs58.decode(sk).subarray(0, 32)).toString('hex'))
  }
  return c.text(sk)
})

/// Recover mpc share
/// body: keys, aux
/// return: mpc share
app.post("/recover_local", async (c) => {
  const body = await c.req.json();
  const keys = body.keys;
  const engine = body.engine ?? 'ECDSA'
  if (!keys) {
    throw new HTTPException(400, { message: "keys is required" });
  }
  const mpc = await SafematrixAuthMpc.initialize({ wasm: wasmBuffer });
  const keypairs = mpc.recover(keys, engine);
  // @ts-ignore
  return c.json(keypairs);
});

/// Sign message with mpc shares
/// body: message, keys, t, isTx (default: message=hello world, keys=[], t=1, isTx=true)
/// isTx to sign a transaction
/// return: signature
app.post("/sign_local", async (c) => {
  const body = await c.req.json();
  let rawMessage = body.message;
  const engine = body.engine ?? 'ECDSA'
  let isTx = body.isTx ?? true
  if (!rawMessage) {
    throw new HTTPException(400, { message: "message is required" });
  }
  /// if sign transaction hash the transaction bytes
  /// if sign message, use hashMessage
  let message
  if (engine === 'ECDSA') {
    message = isTx ? keccak256(rawMessage) : hashMessage(
      rawMessage.startsWith("0x") ? getBytes(rawMessage) : (rawMessage as string)
    );
  }
  const msgs = [getBytes(message as string)];
  const keys = body.keys;
  if (!keys) {
    throw new HTTPException(400, { message: "keys is required" });
  }
  const mpc = await SafematrixAuthMpc.initialize({ wasm: wasmBuffer });
  const sigs = mpc.sign(
    {
      msgs,
      t: 1,
      keys,
    },
    engine
  );
  if (engine === 'EDDSA') {
    return c.text(
      hexlify(Uint8Array.from(sigs[0]))
    )
  }
  const sig = ethers.Signature.from(
    hexlify(Uint8Array.from(sigs[0]))
  ).serialized;
  return c.text(
    sig
  );
});

// serve({
//   fetch: app.fetch,
//   port: 5000,
// });

export default app;


const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const OPTIONS = handler;

