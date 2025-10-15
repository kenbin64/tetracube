# Tetracube

A modular TypeScript framework providing core functionalities including runtime management, data storage, policy enforcement, and more.

## Features

- **Modular Architecture**: Clean separation of concerns across multiple modules
- **TypeScript**: Full TypeScript support with strict type checking
- **Security**: Built-in RBAC, access control, and credential management
- **Testing**: Jest-based testing infrastructure
- **CI/CD**: Pipeline specification for automated deployment
- **Kubernetes**: Production-ready K8s deployment manifests

## Quick Start

### Installation

```bash
npm install
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### Run Demo

```bash
npm run build
node dist/cli/scheduler-demo.js
```

## Project Structure

```
tetracube/
├── src/
│   ├── cli/                 # CLI modules
│   ├── core/                # Core modules (runtime, store, etc.)
│   ├── http/                # HTTP adapters
│   ├── modules/             # Core modules (connector, cortex, enforcer)
│   └── modules-ext/         # Extended modules (material, nl)
├── test/                    # Unit and integration tests
├── infra/                   # Infrastructure (K8s, Terraform)
├── docs/                    # Documentation
└── pipeline-spec.yaml       # CI/CD pipeline specification
```

## Available Modules

### Core
- Runtime management
- Data storage
- Policy DSL
- RBAC
- Credential management
- And more...

### Modules
- **Connector**: External system synchronization
- **Cortex**: Key management, instantiation, simulation
- **Enforcer**: Access control and policy enforcement

### Extended Modules
- **Material**: Template management and grain generation
- **NL**: Natural language parsing and semantic grounding

## Documentation

- [API Documentation](docs/api.md)
- [Security Documentation](docs/security.md)

## Jenkins CI/CD with Docker

This repository also contains a simple, self-contained setup to run a Jenkins CI/CD server using Docker. It includes a custom Dockerfile to install essential plugins and configurations, and a docker-compose.yml file to manage the container, persistent data, and host machine integration.

Table of Contents
Prerequisites

Project Structure

Getting Started

Accessing Jenkins

Troubleshooting

How It Works

Contributing

Prerequisites
Before you begin, make sure you have the following installed on your system:

Docker Desktop: This includes the Docker Engine and Docker Compose. You can download it for Windows, macOS, or Linux.

Project Structure
The project has a simple structure with two main files:

.
├── Dockerfile
├── docker-compose.yml
└── README.md

Dockerfile: Defines the custom Jenkins image, including pre-installed plugins.

docker-compose.yml: Orchestrates the container, manages ports, and sets up a persistent volume.

README.md: The document you are reading right now.

Getting Started
Follow these steps to get your Jenkins server up and running:

Clone this repository to your local machine.

Navigate to the project directory in your terminal.

Run the following command to build the image and start the container in detached mode:

docker-compose up -d --build

The --build flag is crucial for the first run, as it tells Docker Compose to build the custom image defined in the Dockerfile.

Accessing Jenkins
After the command completes, open your web browser and navigate to http://localhost:8080.

The first time you access Jenkins, you'll be prompted to enter an initial admin password. To find this password, open a new terminal and run:

docker logs tetracube_jenkins

Copy the password from the logs and paste it into the Jenkins setup wizard.

Follow the rest of the on-screen instructions to complete the setup.

Troubleshooting
Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?: This error means the Docker Desktop application is not running. Make sure it is launched and active on your system.

Permission Errors: If you encounter permission errors when trying to run Docker commands from Jenkins, ensure the /var/run/docker.sock volume is correctly mounted in your docker-compose.yml file.

How It Works
The docker-compose.yml file uses the build: . command to instruct Docker to build a new image from the Dockerfile in the current directory.

It then mounts your host machine's Docker socket (/var/run/docker.sock) into the Jenkins container. This allows the Jenkins container to issue Docker commands to the host, enabling it to build and run other Docker containers as part of its jobs.

The volumes: section creates a named volume to persist your Jenkins data, including jobs, plugins, and configurations, at /var/jenkins_home.

Contributing
Feel free to open an issue or submit a pull request if you find any bugs or have suggestions for improvements.