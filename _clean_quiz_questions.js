const fs = require('fs');

function findQuestionsBlock(s) {
  const marker = 'quizQuestions';
  const m = s.indexOf(marker);
  if (m === -1) return null;
  const lb = s.indexOf('[', m);
  if (lb === -1) return null;
  let i = lb, depth = 0, inStr = false, strCh = '', esc = false;
  for (; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === strCh) { inStr = false; strCh = ''; }
      continue;
    } else {
      if (ch === '"' || ch === '\'' || ch === '`') { inStr = true; strCh = ch; continue; }
      if (ch === '[') { if (depth === 0 && i !== lb) {/*nested start*/} depth++; }
      else if (ch === ']') { depth--; if (depth === 0) { return { start: lb, end: i + 1 }; } }
    }
  }
  return null;
}

function replaceInQuestionsBlock(s, replacer) {
  const block = findQuestionsBlock(s);
  if (!block) return s;
  const head = s.slice(0, block.start);
  let body = s.slice(block.start, block.end);
  const tail = s.slice(block.end);
  body = replacer(body);
  return head + body + tail;
}

function run() {
  const path = 'quiz-new.html';
  let src = fs.readFileSync(path, 'utf8');

  const out = replaceInQuestionsBlock(src, (body) => {
    // Normalize apostrophes like What�?Ts -> What's
    body = body.replace(/What.?Ts/g, "What's");

    // Numeric ranges: 5 ... 6 hours -> 5-6 hours; similar for times a week, servings, cups, hours
    const units = ['hours', 'times a week', 'servings', 'cups'];
    for (const unit of units) {
      const re = new RegExp('(\\b\\d+)\\D{0,6}(\\d+)(\\s*' + unit.replace(/\s/g, '\\s') + ')', 'g');
      body = body.replace(re, (_m, a, b, u) => `${a}-${b}${u}`);
    }

    // Screen time variations "Less than 2 hours", "2-4 hours", etc. handled above.

    // Replace selfie and email question objects precisely
    body = body.replace(/\{\s*key:\s*'selfie'[\s\S]*?\},/m,
      "    { key: 'selfie', type: 'camera_step', text: 'AI Photo Analysis', subtext: '(Optional - helps us analyze skin health & fine lines)'},\n");
    body = body.replace(/\{\s*key:\s*'email'[\s\S]*?\},?/m,
      "    { key: 'email', type: 'email_step', text: \"Enter your email\", subtext: \"to get your personalized report summary. We respect your privacy.\" },\n");

    // Replace gender/height/weight/userGoal text prompts to ASCII apostrophes
    body = body.replace(/(key:\s*'userGoal'[\s\S]*?text:\s*\").*?main goal\?/m,
      (_m, pre) => `${pre}What's your main goal?`);
    body = body.replace(/(key:\s*'gender'[\s\S]*?text:\s*\").*?biological sex\?/m,
      (_m, pre) => `${pre}What's your biological sex?`);
    body = body.replace(/(key:\s*'height'[\s\S]*?text:\s*\").*?height\?/m,
      (_m, pre) => `${pre}What's your height?`);
    body = body.replace(/(key:\s*'weight'[\s\S]*?text:\s*\").*?weight\?/m,
      (_m, pre) => `${pre}What's your weight?`);

    // Mood emojis: enforce safe set
    body = body.replace(/\{\s*key:\s*'mood'[\s\S]*?\},/m,
      "    { key: 'mood', type: 'emoji_slider', text: \"How would you describe your overall mood?\", subtext: \"Your mental state is deeply connected to your physical health.\", options: [ { text: '😟', value: 'Often stressed or down' }, { text: '😐', value: 'Changes a lot' }, { text: '🙂', value: 'Mostly content' }, { text: '😄', value: 'Happy & energetic' } ] },\n");

    // Replace any smart quotes/dashes with ASCII inside questions block
    body = body
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[–—]/g, '-')
      .replace(/Â/g, '')
      ;

    return body;
  });

  fs.writeFileSync(path, out);
  console.log('Cleaned quiz questions text to ASCII punctuation and safe emojis.');
}

run();

