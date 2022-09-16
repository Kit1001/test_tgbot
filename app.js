const fs = require('fs')
const FormData = require('form-data')
const axios = require('axios')
const {Sequelize, Model, DataTypes} = require('sequelize');
const {execSync} = require('child_process');
require('dotenv').config()


// --------------------------
// Константы
// ---------------------------

const TOKEN = process.env.TOKEN;
const DB_PASS = process.env.POSTGRES_PASSWORD;
const DB_USER = process.env.POSTGRES_USER;
const DB_DB = process.env.POSTGRES_DB;

const url = `https://api.telegram.org/bot${TOKEN}/`
const weatherCodes = JSON.parse(fs.readFileSync('wmo.json'));
const START_TEXT = "Здравствуйте. Нажмите на любую интересующую Вас кнопку";
const KEYBOARD = {
  inline_keyboard: [[{
    text: 'Погода в Канаде', callback_data: 'weather'
  }], [{
    text: 'Хочу почитать!', callback_data: 'wantToRead'
  }], [{
    text: 'Отправить всем сообщение', callback_data: 'broadcast'
  }]]
};


// --------------------------
// Работа с БД
// ---------------------------
// ждем пока запустится postgres

execSync('sleep 10');

sequelize = new Sequelize(DB_DB, DB_USER, DB_PASS, {
  host: 'db', dialect: 'postgres'
});


class User extends Model {
}

User.init({
  // Model attributes are defined here
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true
  },
  username: {
    type: DataTypes.STRING
  }
}, {
  // Other model options go here
  sequelize, // We need to pass the connection instance
  modelName: 'User' // We need to choose the model name
});

class Offset extends Model {
}

Offset.init({
  // Model attributes are defined here
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true
  },
  offsetValue: {
    type: DataTypes.BIGINT,
  }
}, {
  // Other model options go here
  sequelize, // We need to pass the connection instance
  modelName: 'Offset' // We need to choose the model name
});


// --------------------------
// Основные функции
// ---------------------------


async function getUpdates(offset = 0) {
  return await axios.get(url + 'getUpdates' + `?offset=${offset}`).then((r) => r.data.result).catch((e) => console.log(e));
}

async function handleMessage(message) {
  const uId = message.from.id

  if (message.hasOwnProperty('reply_to_message') && message.reply_to_message.text === 'Введите сообщение, которое хотите отправить всем пользователям.') {
    // Рассылка отправляется, в том числе самому себе, чтобы проще было тестировать.
    const users = User.findAll();
    const text = message.text;
    if (users) {
      (await users).forEach((user) => {
          sendMessage(user.dataValues.id, text);
        }
      )
    }
    return await sendMessage(uId, 'Сообщение было отправлено всем пользователям.')
  }

  if (message.text === '/start') {
    // проверяем есть ли юзер в базе, если нет - добавляем
    const user = await User.findByPk(uId);
    if (!user) {
      await User.create({id: uId, username: message.from.username})
    }
    return await sendMessage(message.chat.id, START_TEXT, KEYBOARD)
  }

}

async function handleCallbackQuery(query) {
  // Обработка кнопки "погода в канаде" - обращаемся к api, формируем ответ. API возвращает погодный код, таблица с этими кодами в файле wmo.json
  if (query.data === 'weather') {
    const weather = await axios.get("https://api.open-meteo.com/v1/forecast?latitude=45.4235&longitude=-75.6979&current_weather=1")
      .then((r) => {
        return {...r.data.current_weather, weathercode: weatherCodes[r.data.current_weather.weathercode]}
      });
    const response = `В Канаде ${weather.temperature} градусов Цельсия. ${weather.weathercode}`;
    return await sendMessage(query.from.id, response)
  }

  if (query.data === 'wantToRead') {
    const photoUrl = "https://pythonist.ru/wp-content/uploads/2020/03/photo_2021-02-03_10-47-04-350x2000-1.jpg"
    const caption = "Идеальный карманный справочник для быстрого ознакомления с особенностями работы разработчиков на Python. Вы найдете море краткой информации о типах и операторах в Python, именах специальных методов, встроенных функциях, исключениях и других часто используемых стандартных модулях."

    const photo = await sendPhoto(query.from.id, photoUrl, caption).then((r) => r.data);
    const file = './karmaniy_spravochnik_po_piton.zip'

    const document = await sendDocument(query.from.id, file).then((r) => r.data)
    return [photo, document]
  }

  if (query.data === 'broadcast') {
    const text = 'Вы выбрали рассылку всем пользователям. Вы уверены что хотите это сделать?'
    const markup = {
      inline_keyboard: [[{
        text: 'Да, уверен', callback_data: 'broadcast_approved'
      },
        {
          text: 'Отмена', callback_data: 'restart'
        }
      ]]
    }
    return await sendMessage(query.from.id, text, markup)
  }

  if (query.data === 'broadcast_approved') {
    const text = 'Введите сообщение, которое хотите отправить всем пользователям.'
    const markup = {force_reply: true}
    return await sendMessage(query.from.id, text, markup)
  }

  if (query.data === 'restart') {
    return await sendMessage(query.from.id, START_TEXT, KEYBOARD)
  }
}

async function handleUpdates(updates) {
  const results = []
  updates.forEach((update) => {
    if (update.hasOwnProperty('message')) {
      // console.log(update)
      const result = handleMessage(update.message);
      results.push(result);
    } else if (update.hasOwnProperty('callback_query')) {
      const result = handleCallbackQuery(update.callback_query);
      results.push(result);
    }
  })
  return results
}

async function sendMessage(uid, text, reply_markup = {}) {
  return await axios.post(url + `sendMessage`, {
    chat_id: uid, text, reply_markup
  }).then((r) => r.data).catch((e) => console.log(e));
}

async function sendPhoto(uid, photoUrl, caption = '') {
  return await axios.post(url + `sendPhoto`, {
    chat_id: uid, photo: photoUrl, caption
  }).then((r) => r.data).catch((e) => console.log(e));
}

async function sendDocument(uid, filePath) {
  const formData = new FormData();
  formData.append('chat_id', uid);
  formData.append('document', fs.createReadStream(filePath));
  return await axios.post(url + `sendDocument`, formData).then((r) => r.data)
}


// --------------------------
// Главный цикл
// ---------------------------


async function main() {
  await sequelize.sync();
  let offset = Offset.findOrCreate({where: {id: 1}, defaults: {offsetValue: 0}});


  while (true) {
    const updates = await getUpdates(offset)
    // console.log(updates)
    if (updates.length > 0) {
      offset = updates[updates.length - 1].update_id + 1;
      await Offset.update({offsetValue: offset}, {
        where: {
          id: 1
        }
      });
    }
    await handleUpdates(updates)
    execSync('sleep 1')
  }
}

main()
