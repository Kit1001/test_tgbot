### Запуск
- Потребуется git, docker и docker-compose:  
- `sudo apt-get install git docker docker-compose -y`
- Копируем файлы с репозитория в рабочую папку:
- `git clone https://github.com/Kit1001/test_tgbot.git`
- Переходим в папку проекта
- `cd test_tgbot`
- Прописываем токен бота в файл .env, в поле TOKEN
- Запускаем оркестратор:
- `sudo docker-compose up --detach`


#### Примечания
Не успел как следует оформить комментарии, и само приложение целиком в одном файле.
БД запускается в отдельном контейнере, для работы с ней использовал библиотеку ORM Sequelize.
