import { Near, decodeSignedDelegateAction } from "near-kit";

export class RegistryService {
  constructor(
    private readonly near: Near,
    private readonly relayerAccountId: string
  ) {}

  async submitUpdateTx(payload: string): Promise<{ hash: string }> {
    const userAction = decodeSignedDelegateAction(payload);

    const result = await this.near
      .transaction(this.relayerAccountId)
      .signedDelegateAction(userAction)
      .send();

    return { hash: result.transaction.hash };
  }
}
