/** 스피드 퀴즈 문제 뱅크. 게임 패키지 내부에 있으므로 이 게임만 독립 업데이트된다. */
export interface Question {
  q: string;
  choices: string[];
  answer: number; // choices 인덱스
}

export const QUESTIONS: Question[] = [
  { q: '대한민국의 수도는?', choices: ['서울', '부산', '인천', '대구'], answer: 0 },
  { q: '태양계에서 가장 큰 행성은?', choices: ['지구', '목성', '화성', '금성'], answer: 1 },
  { q: '무지개는 보통 몇 가지 색으로 표현할까요?', choices: ['5', '6', '7', '8'], answer: 2 },
  { q: '물의 화학식은?', choices: ['CO₂', 'H₂O', 'O₂', 'NaCl'], answer: 1 },
  { q: '한글을 창제한 왕은?', choices: ['세종대왕', '태조', '광개토대왕', '정조'], answer: 0 },
  { q: '피자의 발상지로 알려진 나라는?', choices: ['프랑스', '이탈리아', '미국', '그리스'], answer: 1 },
  { q: '축구 한 팀의 경기 출전 선수는 몇 명?', choices: ['9', '10', '11', '12'], answer: 2 },
  { q: '지구에서 가장 넓은 대양은?', choices: ['대서양', '인도양', '태평양', '북극해'], answer: 2 },
  { q: '빛의 삼원색이 아닌 것은?', choices: ['빨강', '초록', '파랑', '노랑'], answer: 3 },
  { q: '컴퓨터의 두뇌라 불리는 부품은?', choices: ['RAM', 'CPU', 'SSD', 'GPU'], answer: 1 },
  { q: '얼음이 녹기 시작하는 온도는?', choices: ['0℃', '100℃', '-10℃', '50℃'], answer: 0 },
  { q: '대한민국의 화폐 단위는?', choices: ['엔', '위안', '원', '달러'], answer: 2 },
  { q: '1년은 보통 며칠일까요?', choices: ['353일', '365일', '375일', '360일'], answer: 1 },
  { q: '태극기의 가운데 원(태극) 색은?', choices: ['빨강·파랑', '검정·흰색', '초록·노랑', '보라·주황'], answer: 0 },
];

export default QUESTIONS;
