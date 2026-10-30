import { tcleDocument } from '@taskplay/shared-types';
import { TcleController } from './tcle.controller';

describe('TcleController', () => {
  it('entrega o termo no formato que o aplicativo sabe desenhar', () => {
    const termo = new TcleController().vigente();
    expect(tcleDocument.safeParse(termo).success).toBe(true);
  });
});
