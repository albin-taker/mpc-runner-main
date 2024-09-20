import { Signature, getBytes, verifyMessage } from "ethers";
import { describe, test, expect } from "vitest";
import { computeAddress } from 'ethers'
import * as keyfile from "./keys.json";

describe(
  "MPC",
  () => {
    let keys: Object[] = [];
    let address: string;
    const baseUrl = "http://127.0.0.1:5000";
    test('generate', async () => {
        const res = await fetch(baseUrl + '/generate_local')
        keys = await res.json()
        console.log({...keys})
        console.log(address)
        expect(keys.length).toBe(3)
    })
    test("address", async () => {
      const res = await fetch(baseUrl + "/address_local", {
        method: "POST",
        body: JSON.stringify({
          key: keys[0],
        }),
      });
      address = await res.text();
      console.log(address);
    });
    test('recover', async () => {
        const res = await fetch(baseUrl + '/recover_local', {
            method: 'POST',
            body: JSON.stringify({
                keys: [keys[0], keys[1]],
            })
        })
        
        const keypairs = await res.json()
        console.log({keypairs});
        // @ts-ignore
        expect(keypairs[0].x_i).toBe(keys[2].x_i)
    }),
    test("sign", async () => {
      const message =
        "0x01ec83066eed808407bfa48082cf08945625aa9363abd1388dad50fc77e11c6fd80aa23d872386f26fc1000080c0";
      const isTx = false;
      const res = await fetch(baseUrl + "/sign_local", {
        method: "POST",
        body: JSON.stringify({
          message,
          keys: [keys[0], keys[1]],
          isTx,
          t: 1,
        }),
      });
      const sig = await res.text();
      const rsv = Signature.from(sig);
      const result = verifyMessage(getBytes(message), sig);
      expect(result.toLowerCase()).toBe(address.toLowerCase());
    });
  },
  {
    timeout: 60000,
  }
);
