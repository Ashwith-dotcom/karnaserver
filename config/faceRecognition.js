import AWS from "aws-sdk"

// Configure AWS SDK
AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
})

const rekognition = new AWS.Rekognition()

export const detectFaces = async (imageBuffer) => {
  const params = {
    Image: {
      Bytes: imageBuffer,
    },
    Attributes: ["ALL"],
  }

  try {
    const response = await rekognition.detectFaces(params).promise()
    return response
  } catch (error) {
    console.error("Error detecting faces:", error)
    throw error
  }
}

export const indexFaces = async (collectionId, imageBuffer, externalImageId) => {
  const params = {
    CollectionId: collectionId,
    Image: {
      Bytes: imageBuffer,
    },
    ExternalImageId: externalImageId,
    DetectionAttributes: ["ALL"],
  }

  try {
    const response = await rekognition.indexFaces(params).promise()
    return response
  } catch (error) {
    console.error("Error indexing faces:", error)
    throw error
  }
}

export const searchFacesByImage = async (collectionId, imageBuffer) => {
  const params = {
    CollectionId: collectionId,
    Image: {
      Bytes: imageBuffer,
    },
    MaxFaces: 1,
    FaceMatchThreshold: 95,
  }

  try {
    const response = await rekognition.searchFacesByImage(params).promise()
    return response
  } catch (error) {
    console.error("Error searching faces by image:", error)
    throw error
  }
}

