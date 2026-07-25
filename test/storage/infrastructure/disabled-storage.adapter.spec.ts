import { AppErrorCode } from '../../../src/common/http/app-error-code';
import { DomainException } from '../../../src/common/http/domain.exception';
import { DisabledStorageAdapter } from '../../../src/storage/infrastructure/disabled-storage.adapter';

describe('비활성화된 저장소 어댑터', () => {
  it('업로드 시도에 기존 저장소 비활성화 오류를 반환한다', async () => {
    const storage = new DisabledStorageAdapter();

    await expect(storage.uploadProfile({} as Express.Multer.File)).rejects.toEqual(
      new DomainException(AppErrorCode.STORAGE_DISABLED),
    );
  });

  it('저장소 키를 공개 URL로 노출하지 않는다', async () => {
    await expect(new DisabledStorageAdapter().resolvePublicUrl('profile/key')).resolves.toBeNull();
  });

  it('게시글 이미지 업로드 시도에도 같은 저장소 비활성화 오류를 반환한다', async () => {
    const storage = new DisabledStorageAdapter();

    await expect(storage.uploadPostImages([{} as Express.Multer.File])).rejects.toEqual(
      new DomainException(AppErrorCode.STORAGE_DISABLED),
    );
  });
});
