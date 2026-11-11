# 살림재고

개인용 생활용품 재고 관리 앱 (안드로이드 홈 화면에 설치하는 PWA).
분류: 세면도구 · 생활용품 · 주방용품 · 식재료 · 고양이 (우리집: 사람 2, 고양이 2)

## 기능 (v0.3)
- 품목 등록 (기본 품목 85개에서 골라 현재 수량과 함께 추가 / 직접 추가), 분류·검색
- 설정의 '우리집'(사람·고양이 수)에 맞춰 추천 최소 보유량 계산
- 목록에서 −/+ 로 수량 조절, 실수하면 '되돌리기'
- 최소 보유량보다 적어지면 → 장보기 목록에 자동 추가 (주 구매처 → 없으면 최근 구매처별로 묶음)
- 구매처 관리 (매장/온라인, 배송 기간) + 품목별 주 구매처 → 장보기를 구매처 탭으로 나눠 보기, 온라인은 배송 기간만큼 미리 알림
- 구매 기록 (날짜·수량·가격·구매처) → 재고 자동 증가
- 품목별 예상 소진일, 평균 구매 주기, 최근/최저 단가
- 백업 파일 내보내기 / 불러오기 (데이터는 기기에만 저장)

## 파일
| 파일 | 역할 |
|---|---|
| `index.html` | 화면 뼈대 |
| `app.js` | 데이터·계산·화면 로직 전부 |
| `styles.css` | 디자인 (다크 모드 지원) |
| `manifest.webmanifest`, `sw.js`, `icons/` | 설치·오프라인용 PWA 설정 |
| `tools/serve.js` | PC에서 테스트할 때 쓰는 개발 서버 |

## PC에서 실행
```bash
node tools/serve.js
```
→ http://localhost:5173

## 데이터 구조 (localStorage `salim-jaego.v1`)
- `household`: { people, cats }
- `stores`: { id, name, type(offline|online), leadDays }
- `items`: { id, name, category(bath|living|kitchen|food|pet), unit, qty, minQty, memo, onList, storeId }
- `purchases`: { id, itemId, date, qty, price, store }
- `logs`: { id, itemId, at, delta } — −/+ 사용 기록, 소비 속도 계산에 사용
