const fs = require('fs');
let s = fs.readFileSync('quiz-new.html','utf8');
// Fix What's
s = s.replace(/What.?Ts/g, "What's");
// Fix numeric ranges like 5�?"6 -> 5-6
s = s.replace(/(\d)[^0-9\"]*\"(\d)(\s*hours)/g, (_, a, b, tail) => `${a}-${b}${tail}`);
s = s.replace(/(\d)[^0-9\"]*\"(\d)(\s*times a week)/g, (_, a, b, tail) => `${a}-${b}${tail}`);
s = s.replace(/(\d)[^0-9\"]*\"(\d)(\s*cups)/g, (_, a, b, tail) => `${a}-${b}${tail}`);
// Fix mood emojis block (replace any broken emojis in that line)
s = s.replace(/\{ key: 'mood'[\s\S]*?options: \[([^\]]+)\] \},/m, (m) => {
  return `    { key: 'mood', type: 'emoji_slider', text: "How would you describe your overall mood?", subtext: "Your mental state is deeply connected to your physical health.", options: [ { text: '😟', value: 'Often stressed or down' }, { text: '😐', value: 'Changes a lot' }, { text: '🙂', value: 'Mostly content' }, { text: '😄', value: 'Happy & energetic' } ] },`;
});
// Fix screen_time options
s = s.replace(/(screen_time[\s\S]*options: \[[^\]]*)2[^0-9\"]*\"4([^\]]*)4[^0-9\"]*\"6/,
  (m, a, mid) => `${a}2-4${mid}4-6`);
// Remove/normalize selfie and email lines
s = s.replace(/\{ key: 'selfie',[\s\S]*?\},/m, `    { key: 'selfie', type: 'camera_step', text: 'AI Photo Analysis', subtext: '(Optional - helps us analyze skin health & fine lines)'},`);
s = s.replace(/\{ key: 'email',[\s\S]*?\}\n/m, `    { key: 'email', type: 'email_step', text: "Enter your email", subtext: "to get your personalized report summary. We respect your privacy." }\n`);
fs.writeFileSync('quiz-new.html', s);
console.log('Applied encoding cleanups to quiz-new.html');
