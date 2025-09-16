const fs = require('fs');
let s = fs.readFileSync('quiz-new.html','utf8');
function replaceQuestion(key, line){
  const re = new RegExp("\\{\\s*key:\\s*'"+key+"'[\\s\\S]*?\\},");
  if(re.test(s)) s = s.replace(re, line);
}
// Normalize What's
s = s.replace(/What.?Ts/g, "What's");
// Sleep ranges
replaceQuestion('sleep', `    { key: 'sleep', type: 'options', text: "On average, how much do you sleep?", subtext: "Quality sleep is crucial for cellular repair and mental clarity.", options: [{text:"Less than 5 hours"}, {text:"5-6 hours"}, {text:"7-8 hours"}, {text:"More than 8 hours"}] },`);
// Activity ranges
replaceQuestion('activity', `    { key: 'activity', type: 'options', text: "How often do you exercise?", subtext: "Regular exercise impacts cardiovascular health and longevity.", options: [{text:"Rarely / Never"}, {text:"1-2 times a week"}, {text:"3-4 times a week"}, {text:"5+ times a week"}] },`);
// Nutrition ranges
replaceQuestion('nutrition', `    { key: 'nutrition', type: 'options', text: "How many servings of fruits & veggies do you eat daily?", subtext: "A diet rich in nutrients is vital for your overall well-being.", options: ["0-1 serving", "2-3 servings", "4-5 servings", "More than 5 servings"] },`);
// Processed food ranges
replaceQuestion('processed_food', `    { key: 'processed_food', type: 'options', text: "How often do you eat processed or fast food?", subtext: "High consumption can lead to inflammation and other health issues.", options: ["Rarely", "1-2 times a week", "3-4 times a week", "Daily"] },`);
// Hydration ranges
replaceQuestion('hydration', `    { key: 'hydration', type: 'options', text: "How much water do you drink per day?", subtext: "Proper hydration is essential for every bodily function.", options: ["1-3 cups", "4-6 cups", "7-9 cups", "10+ cups"] },`);
// Screen time ranges
replaceQuestion('screen_time', `    { key: 'screen_time', type: 'options', text: "How much screen time do you have daily (outside of work)?", subtext: "Excessive screen time can impact sleep and mental well-being.", options: ["Less than 2 hours", "2-4 hours", "4-6 hours", "More than 6 hours"] },`);
// Selfie and email texts
replaceQuestion('selfie', `    { key: 'selfie', type: 'camera_step', text: 'AI Photo Analysis', subtext: '(Optional - helps us analyze skin health & fine lines)'},`);
replaceQuestion('email', `    { key: 'email', type: 'email_step', text: "Enter your email", subtext: "to get your personalized report summary. We respect your privacy." },`);
// Gender/height/weight/userGoal apostrophes
replaceQuestion('userGoal', `    { key: 'userGoal', type: 'options', text: "What's your main goal?", subtext: "This helps us tailor the final report to your interests.", options: [{text: 'Find out my Biological Age', value:'bio_age'}, {text:'Get a Skin Health Analysis', value: 'skin'}, {text:'Receive a 7-Day Improvement Plan', value:'plan'}, {text:'All of the above!', value: 'all'}] },`);
replaceQuestion('gender', `    { key: 'gender', type: 'gender_selection', text: "What's your biological sex?", subtext: "Biological sex influences body composition and metabolic rate.", options: [{value: 'male', img: 'male.svg'}, {value: 'female', img: 'female.svg'}] },`);
replaceQuestion('height', `    { key: 'height', type: 'slider', text: "What's your height?", subtext: "We use this to calculate your Body Mass Index (BMI).", min: 140, max: 220, defaultValue: 175, unit: 'cm' }, // 4'6" to 7'0"`);
replaceQuestion('weight', `    { key: 'weight', type: 'slider', text: "What's your weight?", subtext: "We use this to calculate your Body Mass Index (BMI).", min: 40, max: 150, defaultValue: 77, unit: 'kg' },`);
// Mood emojis
replaceQuestion('mood', `    { key: 'mood', type: 'emoji_slider', text: "How would you describe your overall mood?", subtext: "Your mental state is deeply connected to your physical health.", options: [ { text: '😟', value: 'Often stressed or down' }, { text: '😐', value: 'Changes a lot' }, { text: '🙂', value: 'Mostly content' }, { text: '😄', value: 'Happy & energetic' } ] },`);
// Remove any /* ... */ block that contains 'mood', to drop corrupted duplicates
s = s.replace(/\/\*[\s\S]*?mood[\s\S]*?\*\//g, '');
fs.writeFileSync('quiz-new.html', s);
console.log('Standardized quiz text and removed corrupted blocks');
