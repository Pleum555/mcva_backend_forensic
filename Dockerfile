FROM public.ecr.aws/docker/library/node:16.15-alpine

COPY . ./app

WORKDIR /app

RUN yarn install

RUN yarn build

EXPOSE 3001

ENTRYPOINT [ "yarn", "start" ]

