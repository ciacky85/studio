# Firebase Studio - Classroom Scheduler

This is a Next.js application for managing classroom schedules, user registrations, and lesson bookings.

## Getting Started

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

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

This application includes a `Dockerfile` for containerization.

### Building the Docker Image

From the root directory of the project, run:

```bash
docker build -t classroom-scheduler .
```

You can optionally pass build arguments if needed (though runtime environment variables are preferred for secrets):

```bash
# Example passing a build-time arg (less common for secrets)
# docker build --build-arg GOOGLE_GENAI_API_KEY=your_key -t classroom-scheduler .
```

### Running the Docker Container

To run the application inside a Docker container:

```bash
docker run -p 3000:3000 \
  -e EMAIL_USER="your_gmail_address@gmail.com" \
  -e EMAIL_PASS="your_gmail_app_password" \
  -e GOOGLE_GENAI_API_KEY="your_google_genai_api_key" \
  --name classroom-scheduler-app \
  -d classroom-scheduler
```

**Explanation:**

*   `-p 3000:3000`: Maps port 3000 on your host machine to port 3000 inside the container (where the Next.js app runs by default). Change the host port (the first `3000`) if it's already in use.
*   `-e VARIABLE_NAME="value"`: Sets runtime environment variables required by the application inside the container. **Replace the placeholder values** with your actual credentials.
*   `--name classroom-scheduler-app`: Assigns a name to the container for easier management.
*   `-d`: Runs the container in detached mode (in the background).
*   `classroom-scheduler`: The name of the image you built earlier.

The application should then be accessible on your host machine at `http://localhost:3000` (or whichever host port you mapped).

### Deployment on Synology NAS (General Steps)

Deploying to a Synology NAS using Docker typically involves these steps:

1.  **Install Docker Package:** Ensure the Docker package is installed on your Synology NAS via the Package Center.
2.  **Transfer Docker Image:** You can either:
    *   Build the image directly on the NAS if it has sufficient resources and Docker build tools installed (less common).
    *   Build the image on your development machine and push it to a container registry (like Docker Hub, GitLab Container Registry, GitHub Container Registry, or Synology's own Container Registry package). Then pull the image onto the NAS using the Docker app.
    *   Build the image on your development machine, save it as a `.tar` file (`docker save -o classroom-scheduler.tar classroom-scheduler`), transfer the `.tar` file to your NAS, and load it using the Docker app (Image -> Add -> Add From File).
3.  **Launch Container:**
    *   Open the Docker application on your Synology NAS.
    *   Go to the "Image" section, select the `classroom-scheduler` image, and click "Launch".
    *   **Container Name:** Give your container a name (e.g., `classroom-scheduler-app`).
    *   **Advanced Settings:**
        *   **Port Settings:** Map a local port on your NAS (e.g., `3000`) to the container's port `3000` (TCP).
        *   **Environment:** Add the required environment variables (`EMAIL_USER`, `EMAIL_PASS`, `GOOGLE_GENAI_API_KEY`) with their corresponding values. **Do not store sensitive information directly in configuration files if possible; use the environment variable section.**
        *   **Volume (Optional but Recommended for Data):** Since this app currently uses `localStorage`, container data is ephemeral. For persistent data (if you switch from localStorage later, e.g., to a database), you would configure volume mappings here. For now, with `localStorage`, data persistence relies on the *browser*, not the container itself.
    *   Review the summary and click "Done" or "Apply".
4.  **Access Application:** Once the container is running, you should be able to access the application via your Synology NAS's IP address and the local port you mapped (e.g., `http://<your-nas-ip>:3000`).
5.  **Firewall:** Ensure your Synology NAS firewall allows traffic on the mapped host port (e.g., 3000).

*Note: Specific UI elements and steps within the Synology Docker application might vary slightly depending on the DSM (DiskStation Manager) version.*
