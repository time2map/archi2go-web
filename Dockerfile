# Сборка статики: Vite → /app/dist
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Адрес API зашивается в бандл на сборке, поэтому это build-arg, а не env контейнера.
ARG VITE_ARCHI2GO_BACK_URL=https://archi2api.time2map.com
ARG VITE_MAPBOX_ACCESS_TOKEN
ARG VITE_MAPBOX_STYLE=mapbox://styles/mapbox/standard
# Префикс, под которым живёт сборка: пусто — корень домена, '/dev/' — dev-стенд
ARG VITE_BASE_PATH=
ENV VITE_ARCHI2GO_BACK_URL=$VITE_ARCHI2GO_BACK_URL \
    VITE_MAPBOX_ACCESS_TOKEN=$VITE_MAPBOX_ACCESS_TOKEN \
    VITE_MAPBOX_STYLE=$VITE_MAPBOX_STYLE \
    VITE_BASE_PATH=$VITE_BASE_PATH

RUN npm run build

# Рантайм: nginx раздаёт dist с SPA-fallback (клиентские маршруты /design-1/:cityId)
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
