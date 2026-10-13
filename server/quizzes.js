import { readFileSync } from 'node:fs';

export function validateQuizzes(value) {
  if (!Array.isArray(value) || !value.length) throw new Error('Quiz catalog must be a nonempty array.');
  const ids = new Set();
  for (const quiz of value) {
    if (!quiz || typeof quiz.id !== 'string' || !/^[a-z0-9-]{1,50}$/.test(quiz.id) || ids.has(quiz.id)) throw new Error('Invalid or duplicate quiz id.');
    ids.add(quiz.id);
    if (typeof quiz.title !== 'string' || !quiz.title.trim() || quiz.title.length > 120 || typeof quiz.subject !== 'string' || typeof quiz.description !== 'string') throw new Error('Invalid quiz metadata.');
    if (!Array.isArray(quiz.questions) || quiz.questions.length < 2 || quiz.questions.length > 500) throw new Error('Each quiz needs 2–500 questions.');
    for (const q of quiz.questions) {
      if (typeof q.prompt !== 'string' || !q.prompt.trim() || q.prompt.length > 600 || !Array.isArray(q.answers) || q.answers.length !== 4 || q.answers.some(a => typeof a !== 'string' || !a.trim() || a.length > 200) || new Set(q.answers).size !== 4 || !Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3 || typeof q.explanation !== 'string' || q.explanation.length > 1000) throw new Error(`Invalid question in ${quiz.id}.`);
    }
  }
  return value;
}
export const quizzes = validateQuizzes(JSON.parse(readFileSync(new URL('../data/quizzes.json', import.meta.url), 'utf8')));
export const catalog = quizzes.map(({ questions, ...quiz }) => ({ ...quiz, questionCount: questions.length }));
