/* Apps Script 백엔드의 contractMail 검증
   Code.gs 를 그대로 읽어 구글 전역(GmailApp·Utilities 등)만 가짜로 끼워 실행한다.
   실행: node test/contract-mail.test.mjs */
import fs from 'fs';
import path from 'path';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const CODE = fs.readFileSync(path.join(REPO, 'apps-script', 'Code.gs'), 'utf8');

let fail = 0;
const chk = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) fail++; };

/* ── 구글 전역 가짜 구현 ── */
function makeEnv({ deployer = 'cheddar@dayzcorp.kr', aliases = [], sendThrows = null, quota = 100 } = {}) {
  const sentAll = [];
  const env = {
    sent: sentAll,
    logs: [],
    Session: { getEffectiveUser: () => ({ getEmail: () => deployer }) },
    GmailApp: {
      getAliases: () => aliases,
      sendEmail: (to, subject, body, opts) => {
        if (sendThrows) throw new Error(sendThrows);
        sentAll.push({ to, subject, body, opts });
      },
    },
    MailApp: { getRemainingDailyQuota: () => quota },
    Utilities: {
      base64Decode: (b64) => Buffer.from(b64, 'base64'),
      newBlob: (bytes, type, name) => ({ bytes, type, name }),
      getUuid: () => 'uuid',
      computeDigest: () => [],
      Charset: { UTF_8: 'utf8' },
      DigestAlgorithm: { SHA_256: 'sha256' },
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'x', setProperty: () => {} }) },
    SpreadsheetApp: { openById: () => null, getActiveSpreadsheet: () => null },
    DriveApp: {}, LockService: {}, ContentService: { createTextOutput: () => ({ setMimeType: () => {} }), MimeType: {} },
    Logger: { log: () => {} },
    console,
  };
  const names = Object.keys(env);
  // Code.gs 전체를 정의한 뒤 필요한 함수만 꺼낸다 (json/logAction 은 테스트용으로 덮어씀)
  const factory = new Function(...names, CODE + `
    ;json = function(o){ return o; };
    logAction = function(a){ logs.push(a); };
    return { contractMail: contractMail, teamAlias: teamAlias };
  `);
  return { env, api: factory(...names.map(n => env[n])) };
}

const DOCX = 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,' +
  Buffer.from('PKfake-docx-bytes').toString('base64');
const BODY = {
  to: 'model@example.com', subject: '[베이스튠] 광고모델 계약서 - 김하늘님',
  body: '김하늘님, 안녕하세요.\n계약서를 보내드립니다.', filename: '광고모델계약서_김하늘_2026년08월05일.docx',
  data: DOCX, brand: 'basetune', senderName: '주식회사 드래프터',
};
const SESS = { username: '테스터', role: 'staff' };

console.log('1) 정상 발송 (배포 계정 = 팀 메일)');
{
  const { env, api } = makeEnv({ deployer: 'cheddar@dayzcorp.kr' });
  const r = api.contractMail(SESS, BODY);
  chk(r.ok === true, '성공 응답');
  chk(env.sent.length === 1, '메일 1통 발송');
  const s = env.sent[0];
  chk(s.to === 'model@example.com', '받는 사람 = 입력한 주소');
  chk(s.subject === BODY.subject, '제목 그대로');
  chk(s.body.includes('김하늘님'), '본문 그대로');
  chk(s.opts.attachments.length === 1, '첨부 1개');
  chk(s.opts.attachments[0].name === BODY.filename, '첨부 파일명 유지');
  chk(Buffer.compare(s.opts.attachments[0].bytes, Buffer.from('PKfake-docx-bytes')) === 0, '첨부 바이트가 만든 파일과 동일');
  chk(s.opts.replyTo === 'cheddar@dayzcorp.kr', '회신주소 = 팀 메일');
  chk(s.opts.name === '주식회사 드래프터', '발신 표시명 = 브랜드 회사');
  chk(!s.opts.from && !s.opts.cc, '이미 팀 계정이라 from·cc 불필요');
  chk(env.logs.some(l => String(l).startsWith('contractMail:')), '발송 로그 기록');
}

console.log('2) 배포 계정이 팀 메일이 아닐 때');
{
  const { env, api } = makeEnv({ deployer: 'someone@gmail.com', aliases: [] });
  const r = api.contractMail(SESS, BODY);
  chk(r.ok === true, '성공 응답');
  chk(env.sent[0].opts.cc === 'cheddar@dayzcorp.kr', '팀 메일로 사본(cc)');
  chk(!env.sent[0].opts.from, '별칭이 없으면 from 미지정(구글이 거부하지 않도록)');
  chk(r.from === 'someone@gmail.com', '실제 발신자를 응답에 알림');
}

console.log('3) 팀 메일이 Gmail 별칭으로 등록돼 있을 때');
{
  const { env, api } = makeEnv({ deployer: 'someone@gmail.com', aliases: ['other@x.com', 'cheddar@dayzcorp.kr'] });
  const r = api.contractMail(SESS, BODY);
  chk(env.sent[0].opts.from === 'cheddar@dayzcorp.kr', '팀 메일로 발신');
  chk(!env.sent[0].opts.cc, '팀 메일이 발신이면 사본 불필요');
  chk(r.from === 'cheddar@dayzcorp.kr', '응답 발신자 = 팀 메일');
}

console.log('4) 잘못된 입력은 막는다');
{
  const { env, api } = makeEnv();
  chk(!!api.contractMail(SESS, { ...BODY, to: 'not-an-email' }).error, '이메일 형식 오류 거부');
  chk(!!api.contractMail(SESS, { ...BODY, to: '' }).error, '빈 수신자 거부');
  chk(!!api.contractMail(SESS, { ...BODY, data: '' }).error, '첨부 없으면 거부');
  chk(!!api.contractMail(SESS, { ...BODY, data: 'garbage' }).error, '잘못된 첨부 데이터 거부');
  chk(env.sent.length === 0, '거부된 요청은 발송 안 함');
}

console.log('5) 파일명·제목 방어');
{
  const { env, api } = makeEnv();
  api.contractMail(SESS, { ...BODY, filename: '계약/서:*?"<>|', subject: '제목\n인젝션: Bcc: x@y.com' });
  chk(!/[\\/:*?"<>|]/.test(env.sent[0].opts.attachments[0].name), '파일명에서 금지문자 제거');
  chk(env.sent[0].opts.attachments[0].name.endsWith('.docx'), '확장자 보정');
  chk(!/\n/.test(env.sent[0].subject), '제목의 줄바꿈 제거(헤더 인젝션 차단)');
}

console.log('6) 발송 한도·실패 처리');
{
  const q = makeEnv({ quota: 0 });
  chk(/한도/.test(q.api.contractMail(SESS, BODY).error || ''), '일일 한도 소진 시 안내');
  chk(q.env.sent.length === 0, '한도 소진이면 발송 시도 안 함');
  const f = makeEnv({ sendThrows: 'Invalid from address' });
  const r = f.api.contractMail(SESS, BODY);
  chk(/메일 발송 실패/.test(r.error || ''), '구글 오류를 그대로 터뜨리지 않고 메시지로 반환');
}

console.log('\n' + (fail ? `❌ 실패 ${fail}건` : '✅ contractMail 전부 통과'));
process.exit(fail ? 1 : 0);
