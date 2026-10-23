// 어디서 열렸는지 판단한다.
//  - cloud : claude.ai 안에서 로그인한 채로 열림 → 공유 저장소(db) 사용
//  - guest : claude.ai 안이지만 저장소를 못 씀(로그아웃 등) → 읽을 수 있는 것만 보여줌
//  - web   : 실제 주소로 배포 + config.js 에 Supabase 설정 → 누구나 읽고, 카카오·구글·메일로 로그인
//  - local : 파일을 직접 띄움(설정 없음) → 이 브라우저의 IndexedDB, 실행한 사람이 관리자

import { supabaseConfigured, getClient, currentViewer, photoBaseUrl } from './supa.js';
import { setPhotoBase } from './media.js';

const LOCAL_ME = Object.freeze({
  id: 'local', name: '', avatarUrl: '', isOwner: true, canEdit: true,
});

const GUEST_ME = Object.freeze({
  id: null, name: '', avatarUrl: '', isOwner: false, canEdit: false,
});

export function isFramedRuntime() {
  return typeof window.claude?.use === 'function';
}

async function use(name) {
  try {
    return await window.claude.use(name);
  } catch {
    return null;
  }
}

export async function detectEnv() {
  if (!isFramedRuntime()) {
    if (supabaseConfigured()) {
      try {
        const sb = await getClient();
        setPhotoBase(photoBaseUrl());
        const me = await currentViewer(sb);
        return { mode: 'web', sb, db: null, user: null, assets: null, downloads: null, me };
      } catch (err) {
        return { mode: 'offline', error: err, db: null, user: null, assets: null, downloads: null, me: GUEST_ME };
      }
    }
    return { mode: 'local', db: null, user: null, assets: null, downloads: null, me: LOCAL_ME };
  }
  const [db, user, assets, downloads] = await Promise.all(
    ['db', 'user', 'assets', 'downloads'].map(use),
  );
  let me = GUEST_ME;
  if (user) {
    const v = await user.me();
    me = {
      id: v?.id ?? null,
      name: v?.name || '',
      avatarUrl: v?.avatarUrl || '',
      isOwner: !!v?.isOwner,
      canEdit: !!v?.canEdit,
    };
  }
  return { mode: db ? 'cloud' : 'guest', db, user, assets, downloads, me };
}
