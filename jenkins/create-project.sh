#!/bin/bash
# A simple script to set up a project workspace.
# This is used by the Jenkins pipeline to prepare the build environment.

# Create the project directory if it doesn't exist
mkdir -p project

# Copy the project files into the new directory
cp Dockerfile project/
cp hello-world.py project/

echo "Project files have been set up in the 'project' directory."
