
# Firebase Studio - Classroom Scheduler

This is a Next.js application for managing classroom schedules, user registrations, and lesson bookings.

## Data Persistence

User registrations, schedule assignments, and availability data are stored as JSON files in the `/app/config` directory *inside the container*. To ensure data persistence across container restarts and updates, you **must** map a local directory on your host machine to this container directory using a Docker volume.

## Getting Started

1.  **Install Dependencies:**
    ```bash
    npm install
    ```
2.  **Environment Variables:**
    Create a `.env` file in the root directory:
    ```plaintext
    # .env
    EMAIL_USER=your_gmail_address@gmail.com
    EMAIL_PASS=your_gmail_app_password
    # Optional: GOOGLE_GENAI_API_KEY=your_google_genai_api_key
    ```
    *   **Important:** Use a Gmail "App Password".
3.  **Create Config Directory:**
    Before running with Docker, create a `config` directory in your project root:
    ```bash
    mkdir config
    ```
    This directory will be mapped to the container to store persistent data. Ensure this directory exists before starting the container for the first time.

4.  **Run Development Server:**
    ```bash
    npm run dev
    ```
    Access at http://localhost:9002. (Development mode does **not** use the file-based persistence, it uses temporary in-memory state or might revert to localStorage depending on component logic during dev).

## Building for Production

```bash
npm run build
```

## Starting the Production Server (Without Docker)

```bash
npm start
```
Runs on port 3000. Data will be stored in the `config` directory relative to where you run the command.

## Docker Deployment

### Using Docker Compose (Recommended)

1.  **Create `.env` File:** As described above.
2.  **Create `config` Directory:** `mkdir config` in the project root if it doesn't exist.
3.  **Build and Run:**
    ```bash
    docker compose up -d --build
    ```
    The `docker-compose.yml` file includes the volume mapping `- ./config:/app/config`.
4.  **Access Application:** `http://localhost:3000`
5.  **Stopping:** `docker compose down`

### Manual Docker Build and Run

#### Building the Image

```bash
docker build -t ghcr.io/ciacky85/studio:latest .
```

#### Running the Docker Container

```bash
# Ensure the 'config' directory exists in your current working directory first!
mkdir -p config

docker run -p 3000:3000 \
  --env-file .env \
  -v "$(pwd)/config:/app/config" \ # Map local config directory to container's /app/config
  --name classroom-scheduler-app \
  -d ghcr.io/ciacky85/studio:latest
```
*   `-v "$(pwd)/config:/app/config"`: This is the crucial part for data persistence. It maps the `config` directory from your current host directory (`$(pwd)/config`) to `/app/config` inside the container.

### Pushing to GitHub Container Registry (Optional)

1.  **Build and Tag:** (See above)
2.  **Login:** `docker login ghcr.io -u ciacky85`
3.  **Push:** `docker push ghcr.io/ciacky85/studio:latest`

### Deployment on Synology NAS (Using Container Manager)

1.  **Install Container Manager:** Via Package Center.
2.  **Get Docker Image on NAS:**
    *   **Pull from Registry:** Open Container Manager, go to "Registry", search for `ghcr.io/ciacky85/studio`, and download the `latest` tag.
    *   **OR Upload .tar:** Build locally, save (`docker save -o studio.tar ghcr.io/ciacky85/studio:latest`), transfer `studio.tar` to NAS, in Container Manager go to "Image" > "Add" > "Add From File".
3.  **Prepare Host Directory for Data:**
    *   Using File Station on your NAS, create a shared folder (or a subfolder within an existing one) where you want to store the application's persistent data. For example, create `/volume1/docker/classroom-scheduler/config`. **Remember this path.**
4.  **Launch Container:**
    *   Go to "Image", select `ghcr.io/ciacky85/studio`, click "Run".
    *   **Container Name:** e.g., `ClassroomApp`.
    *   **Enable auto-restart:** Recommended.
    *   **Port Settings:** Local Port `3000` (or other) -> Container Port `3000`, Type `TCP`.
    *   **Volume Settings:**
        *   Click "Add Folder".
        *   **File/Folder:** Browse and select the host directory you created in step 3 (e.g., `/volume1/docker/classroom-scheduler/config`).
        *   **Mount path:** Enter `/app/config`. This **must** be exactly `/app/config`.
        *   Leave "Read-Only" unchecked.
    *   **Environment Variables:** Add `EMAIL_USER`, `EMAIL_PASS`, `GOOGLE_GENAI_API_KEY` (if needed), and set `NODE_ENV` to `production`.
    *   Review and click "Done".
5.  **Access Application:** `http://<your-nas-ip>:<local-port>` (e.g., `http://192.168.1.100:3000`).
6.  **Firewall:** Ensure your NAS firewall allows incoming traffic on the *local port* mapped.

*Data will now be stored in the host directory you selected (e.g., `/volume1/docker/classroom-scheduler/config`) and will persist even if you stop, remove, or update the container.*
