# --- Stage 1: Build the Frontend Application ---
# Use a Node.js image to build the application's static files.
FROM node:18-alpine as build

# Set the working directory for the build process.
WORKDIR /app

# Copy package.json and package-lock.json to install dependencies.
COPY package*.json ./

# Install frontend dependencies.
RUN npm ci

# Copy the rest of the frontend source code.
COPY . .

# Run the build command to generate the static assets.
# Replace `npm run build` with your project's build command if it's different.
RUN npm run build

# --- Stage 2: Serve the Built Application with Nginx ---
# Use a lightweight Nginx image for the final production container.
FROM nginx:alpine

# Copy the static assets from the 'build' stage into the Nginx container.
# The `/usr/share/nginx/html` directory is where Nginx looks for web content.
COPY --from=build /app/dist /usr/share/nginx/html

# Expose port 80, the standard HTTP port for web traffic.
EXPOSE 80

# The default Nginx CMD will start the web server.
# No need to explicitly define it here.