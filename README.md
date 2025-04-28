
# Firebase Studio - Classroom Scheduler

This is a Next.js application for managing classroom schedules, user registrations, and lesson bookings.

## Getting Started

1.  **Install Dependencies:**
    ```bash
    npm install
    ```
    *Note: This command will also generate or update the `package-lock.json` file based on the dependencies listed in `package.json`.*

2.  **Environment Variables:**
    Create a `.env` file in the root directory and add the necessary environment variables. You'll need credentials for Nodemailer (Gmail App Password) and potentially Google GenAI.
    ```plaintext
    # .env
    EMAIL_USER=your_gmail_address@gmail.com
    EMAIL_PASS=your_gmail_app_password
    # Optional: Add if using Google GenAI features that require an API key
    # GOOGLE_GENAI_API_KEY=your_google_genai_api_key
    ```
    *   **Important:** For Gmail, you need to enable 2-Step Verification and create an "App Password". Use the App Password here, not your regular Gmail password.

3.  **Run Development Server:**
    ```bash
    npm run dev
    ```
    The application will be available at http://localhost:9002.

## Building for Production

```bash
npm run build
```

## Starting the Production Server

```bash
npm start
```
The application will typically run on port 3000 by default in production.

## Docker Deployment

This application includes a `Dockerfile` and `docker-compose.yml` for containerization.

### Using Docker Compose (Recommended)

Docker Compose simplifies the process of building and running multi-container Docker applications.

1.  **Create `.env` File:** Ensure you have a `.env` file in the root directory with your environment variables (see "Environment Variables" section above).
    ```plaintext
    # .env
    EMAIL_USER=your_gmail_address@gmail.com
    EMAIL_PASS=your_gmail_app_password
    # GOOGLE_GENAI_API_KEY=your_google_genai_api_key # Uncomment if needed
    ```
2.  **Build and Run with Docker Compose:**
    From the root directory of the project, run:
    ```bash
    docker compose up -d --build
    ```
    *   `docker compose up`: Builds (if necessary) and starts the services defined in `docker-compose.yml`.
    *   `-d`: Runs the containers in detached mode (in the background).
    *   `--build`: Forces Docker Compose to build the image before starting the container. You might omit `--build` on subsequent runs if the code hasn't changed.

3.  **Access Application:** The application should be accessible at `http://localhost:3000` (or the host port specified in `docker-compose.yml`).

4.  **Stopping the Application:**
    ```bash
    docker compose down
    ```
    This stops and removes the containers defined in the `docker-compose.yml` file.

### Manual Docker Build and Run

#### Building the Docker Image

From the root directory of the project, run:

```bash
# Build locally
docker build -t classroom-scheduler .
# OR tag for GitHub Container Registry
# docker build -t ghcr.io/<github-username>/classroom-scheduler:latest .
```

*   Replace `<github-username>` with your GitHub username if pushing to GHCR.

#### Running the Docker Container

To run the application inside a Docker container manually:

```bash
docker run -p 3000:3000 \
  --env-file .env \
  --name classroom-scheduler-app \
  -d classroom-scheduler
```

**Explanation:**

*   `-p 3000:3000`: Maps port 3000 on your host machine to port 3000 inside the container.
*   `--env-file .env`: Loads environment variables from the `.env` file in the current directory. **Ensure the `.env` file exists where you run this command.**
*   `--name classroom-scheduler-app`: Assigns a name to the container.
*   `-d`: Runs the container in detached mode.
*   `classroom-scheduler`: The name of the image you built.

### Pushing to GitHub Container Registry (Optional)

1.  **Build and Tag:**
    ```bash
    docker build -t ghcr.io/<github-username>/classroom-scheduler:latest .
    ```
    Replace `<github-username>` with your GitHub username.
2.  **Login:**
    ```bash
    docker login ghcr.io -u <github-username>
    ```
    Enter your password or Personal Access Token (with `read:packages` and `write:packages` scopes).
3.  **Push:**
    ```bash
    docker push ghcr.io/<github-username>/classroom-scheduler:latest
    ```
    This command uploads your locally built image to the GitHub Container Registry.

### Deployment on Synology NAS (Using Container Manager)

Deploying to a Synology NAS using Container Manager typically involves these steps:

1.  **Install Container Manager:** Ensure the Container Manager package is installed via the Synology Package Center.
2.  **Get Docker Image on NAS:**
    *   **Option A (Pull from Registry):** If you pushed the image to a registry (like Docker Hub or GHCR), open Container Manager, go to "Registry", search for your image (e.g., `ghcr.io/<your-username>/classroom-scheduler`), and download (pull) the `latest` tag.
    *   **Option B (Upload .tar file):** Build the image locally (`docker build -t classroom-scheduler .`), save it (`docker save -o classroom-scheduler.tar classroom-scheduler`), transfer `classroom-scheduler.tar` to your NAS (e.g., via File Station), then in Container Manager go to "Image", click "Add", choose "Add From File", and upload the `.tar` file.
    *   **Option C (Use docker-compose.yml):** If you have SSH access to your NAS and Docker Compose installed *on the NAS*, you can transfer the entire project folder (including `docker-compose.yml` and `.env`), SSH into the NAS, navigate to the folder, and run `docker compose up -d`. This is more advanced.
3.  **Launch Container (if using Option A or B):**
    *   Go to the "Image" section in Container Manager.
    *   Select the `classroom-scheduler` (or `ghcr.io/...`) image and click "Run" or "Launch".
    *   **Container Name:** Give it a name (e.g., `ClassroomApp`).
    *   **Enable auto-restart:** Recommended for web services.
    *   **Port Settings:** Click "Add Port Setting". Set "Local Port" to `3000` (or another available port on your NAS), "Container Port" to `3000`, and Type to `TCP`.
    *   **Environment Variables:** Go to the "Environment" section. Click "Add". Add *each* required variable:
        *   `EMAIL_USER`: Enter your Gmail address.
        *   `EMAIL_PASS`: Enter your Gmail App Password.
        *   `GOOGLE_GENAI_API_KEY`: Enter your key (if used).
        *   `NODE_ENV`: Set to `production`.
    *   Review the summary and click "Done".
4.  **Access Application:** Once the container is running (check the "Container" section), access it via `http://<your-nas-ip>:<local-port>` (e.g., `http://192.168.1.100:3000`).
5.  **Firewall:** Ensure your Synology NAS firewall (Control Panel -> Security -> Firewall) allows incoming traffic on the *local port* you mapped (e.g., 3000).

*Note: Specific UI elements and steps within the Synology Container Manager application might vary slightly depending on the DSM (DiskStation Manager) version.*
