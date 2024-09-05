# Microservices Setup and Deployment Guide

## 1. Setting up the Development Environment

### Prerequisites:
- [Download and install Node.js](https://nodejs.org/) (includes npm)
  
### Steps:

1. Ensure you are on the `main` branch, then download the code to your local machine.
2. Extract the zip file.
3. Open the folder in **VS Code**.
4. Open the terminal and run the following commands to initialize npm and install Express.js:

    ```bash
    npm init -y # Initialize npm
    npm install express # Install express
    ```

5. Initialize Git:

    ```bash
    git init # Initialize git
    ```

6. For **hello-service**:
    ```bash
    cd hello-service
    npm init -y
    npm install express
    ```

7. For **world-service**:
    ```bash
    cd ../world-service
    npm init -y
    npm install express
    ```

## 2. Building Docker Images

### Steps to build and push Docker images:

1. Log in to Docker Hub:
    ```bash
    docker login
    ```

2. For **hello-service**:
    ```bash
    cd hello-service
    docker build -t helloservice:latest -f Dockerfile.helloservice .
    docker tag helloservice:latest <your-dockerhub-username>/helloservice:latest
    docker push <your-dockerhub-username>/helloservice:latest
    ```

3. For **world-service**:
    ```bash
    cd ../world-service
    docker build -t worldservice:latest -f Dockerfile.worldservice .
    docker tag worldservice:latest <your-dockerhub-username>/worldservice:latest
    docker push <your-dockerhub-username>/worldservice:latest
    ```

## 3. Running Services Locally

To run the services locally, use the following commands:

1. **Hello Service**:
    ```bash
    docker run -p 3002:3002 <your-dockerhub-username>/helloservice
    # Open http://localhost:3002/hello to get the response "Hello"
    ```
    ![Service Running locally](screenshots/docker%20hello.png)
    ![Service Running locally](screenshots/localhost%20hello.png)

2. **World Service**:
    ```bash
    docker run -p 3003:3003 <your-dockerhub-username>/worldservice
    # Open http://localhost:3003/world to get the response "World"
    ```
    ![Service Running locally](screenshots/docker%20world.png)
    ![Service Running locally](screenshots/localhost%20world.png)

## 4. Deploying on Kubernetes

1. Deploy **hello-service**:
    ```bash
    cd ../hello-service
    kubectl apply -f helloservice.yaml
    ```

2. Deploy **world-service**:
    ```bash
    cd ../world-service
    kubectl apply -f worldservice.yaml
    ```

### Access services via Kubernetes:

1. For **hello-service**:
    ```bash
    minikube service helloservice
    # Add /hello in the browser to get the response "Hello"
    ```
    ![Service Running on minikube](screenshots/kubernetes%20hello.png)
    ![Service Running minikube](screenshots/minikube%20hello.png)

2. For **world-service**:
    ```bash
    minikube service world
    # Add /world in the browser to get the response "World"
    ```

    ![Service Running on minikube](screenshots/kubernetes%20world.png)
    ![Service Running minikube](screenshots/minikube%20world.png)
   

## 5. Running the Script to Print "Hello World"

1. Execute the following to print "Hello World":
    ```bash
    cd ..
    node combine.js
    ```

    ![Printing hello world](screenshots/hello%20world.png)


## 6. Docker Image Links

- [World Service Docker Image](https://hub.docker.com/repository/docker/harshakata/worldservice/general)
- [Hello Service Docker Image](https://hub.docker.com/repository/docker/harshakata/helloservice/general)
