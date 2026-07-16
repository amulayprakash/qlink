/**
 * Client-side Tron payments via the injected TronLink wallet.
 * Uses TronLink's own `window.tronWeb` — no tronweb bundle needed in the client.
 */

interface TronLinkProvider {
  request?: (args: { method: string }) => Promise<unknown>;
  tronWeb?: TronWebLike;
}
interface TronWebLike {
  defaultAddress?: { base58?: string };
  contract: () => { at: (addr: string) => Promise<TronContract> };
}
interface TronContract {
  transfer: (
    to: string,
    amount: string,
  ) => { send: () => Promise<string> };
}

function win() {
  return window as unknown as {
    tronLink?: TronLinkProvider;
    tronWeb?: TronWebLike;
  };
}

export async function connectTron(): Promise<{
  address: string;
  tronWeb: TronWebLike;
}> {
  const w = win();
  if (!w.tronLink && !w.tronWeb) {
    throw new Error(
      "TronLink not found. Install the TronLink wallet to pay on Tron.",
    );
  }
  if (w.tronLink?.request) {
    await w.tronLink.request({ method: "tron_requestAccounts" });
  }
  const tronWeb = w.tronWeb ?? w.tronLink?.tronWeb;
  const address = tronWeb?.defaultAddress?.base58;
  if (!tronWeb || !address) {
    throw new Error("Could not connect TronLink. Unlock the wallet and retry.");
  }
  return { address, tronWeb };
}

export async function sendTronTransfer(opts: {
  tokenContract: string;
  recipient: string;
  amount: string; // base units
}): Promise<{ txHash: string; from: string }> {
  const { address, tronWeb } = await connectTron();
  const contract = await tronWeb.contract().at(opts.tokenContract);
  const txHash = await contract
    .transfer(opts.recipient, opts.amount)
    .send();
  return { txHash, from: address };
}
