import {id} from './security.js';
export const starter = [
 ['My aunt sent me to the shop yesterday to buy bread.','Everyday life'],
 ['He broke all the eggs he bought.','Everyday life'],
 ['We will meet at the station tomorrow morning.','Travel'],
 ['The children are reading books in the library.','Education'],
 ['Please close the window before you leave.','Everyday life'],
 ['My sister has worked here for three years.','Work'],
 ['There is no milk left in the bottle.','Food'],
 ['If it rains, we will stay at home.','Everyday life'],
 ['She did not buy the red shoes.','Shopping'],
 ['The doctor asked him to rest for two days.','Health'],
 ['I would like a glass of water, please.','Food'],
 ['They arrived late because the bus broke down.','Travel'],
 ['Can you show me the way to the hospital?','Travel'],
 ['Every language deserves to be understood.','Community'],
 ['We need three more chairs for the meeting.','Work'],
 ['My grandmother grows vegetables in her garden.','Everyday life'],
 ['The market is closed on Sunday.','Shopping'],
 ['I have not finished my homework yet.','Education'],
 ['Turn left after you cross the bridge.','Travel'],
 ['The train leaves in fifteen minutes.','Travel'],
 ['Thank you for helping me carry these bags.','Community'],
 ['Please wash your hands before eating.','Health'],
 ['She is learning to speak another language.','Education'],
 ['The baby was sleeping when the phone rang.','Everyday life']
];
export async function seedCorpus(pool){
 if((await pool.query('SELECT id FROM corpus LIMIT 1')).rowCount)return;
 for(const [source,category] of starter)await pool.query('INSERT INTO corpus(id,source,category) VALUES($1,$2,$3) ON CONFLICT(source) DO NOTHING',[id(),source,category]);
 const people=['My brother','My sister','Our teacher','The farmer','My neighbour','The visitor','The shopkeeper','Our friend','The student','My cousin'];
 const actions=['bought some fresh fruit','prepared a delicious meal','visited the local market','finished reading a book','helped an elderly person','repaired a broken chair','wrote a letter to a friend','took a walk by the river','planted a tree near the school','cleaned the kitchen'];
 const times=['yesterday morning','last Tuesday','before the rain started','after the meeting ended','last weekend','early this morning','during the school holidays','on a sunny afternoon','before travelling home','after finishing work'];
 for(const who of people)for(const what of actions)for(const when of times){const source=`${who} ${what} ${when}.`;await pool.query('INSERT INTO corpus(id,source,category) VALUES($1,$2,$3) ON CONFLICT(source) DO NOTHING',[id(),source,'Everyday life']);}
}
