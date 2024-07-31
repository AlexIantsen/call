# Используем официальный образ Nginx в качестве базового
FROM nginx:alpine

# Копируем файл конфигурации Nginx
COPY nginx.conf /etc/nginx/nginx.conf

# Копируем статические файлы в каталог, обслуживаемый Nginx
COPY . /usr/share/nginx/html
