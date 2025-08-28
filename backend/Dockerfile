# Use an official Node.js image as the base.
# This image contains Node.js and npm, which are necessary for the backend.
FROM node:18-alpine

# Set the working directory inside the container.
# This is where your application code will live.
WORKDIR /app

# Copy the package.json and package-lock.json files first.
# This allows Docker to use a cache layer for dependency installation,
# which speeds up subsequent builds if dependencies haven't changed.
COPY package*.json ./

# Install application dependencies.
# The `npm ci` command is used for cleaner builds in a CI/CD environment.
RUN npm ci

# Copy the rest of the application source code into the container.
COPY . .

# Expose the port that the backend server listens on.
# Change this if your backend server runs on a different port.
EXPOSE 3000

# Define the command to run the application when the container starts.
# Replace `npm start` with your specific start command if it's different.
CMD ["npm", "start"]