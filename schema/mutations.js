const argon2 = require('argon2')
const jwt = require('jsonwebtoken')
const GoogleDrive = require('../google/GoogleDrive')
const prisma = require('../prisma/client')

const gDrive = new GoogleDrive()

const mutations = {
   register: async (_, { username, email, password }, { res }) => {
      const hashedPass = await argon2.hash(password)
      const user = await prisma.user.create({
         data: {
            username: username,
            email: email,
            password: hashedPass
         }
      })

      if (!user) throw new Error('Registration failed :`(')

      user.jwt = jwt.sign({ user_id: user.user_id }, process.env.JWT_SECRET)

      res.cookie('jwt', user.jwt, {
         httpOnly: true,
         sameSite: 'None',
         secure: true
      })

      return user
   },

   login: async (_, { email, password }, { res }) => {
      const user = await prisma.user.findUnique({
         where: {
            email: email
         }
      })

      if (!user) throw new Error('Email not found')

      if (!(await argon2.verify(user.password, password))) {
         throw new Error('Password incorrect')
      }

      user.jwt = jwt.sign({ user_id: user.user_id }, process.env.JWT_SECRET)

      res.cookie('jwt', user.jwt, {
         httpOnly: true,
         sameSite: 'None',
         secure: true
      })

      return user
   },

   editProfile: async (_, { username, password, avatar }, { user }) => {
      const user_id = user?.user_id

      if (!username) {
         username = user.username
      }
      if (!password) {
         password = user.password
      }
      if (!avatar) {
         avatar = user.avatar
      }

      const hashedPass = await argon2.hash(password)

      const updatedUser = await prisma.user.update({
         where: { user_id },
         data: {
            username: username,
            password: hashedPass,
            avatar: avatar
         }
      })

      if (!updatedUser) throw new Error('Error updating user')

      return updatedUser
   },

   createJob: async (
      _,
      { title, description, credits, labels, num_partitions, files },
      { user }
   ) => {
      // Job metadata
      const job_owner_id = 1
      const job = await prisma.job.create({
         data: { title, description, credits, job_owner_id }
      })

      if (!job) throw new Error('Error creating job.')

      // Job labels
      labels.forEach(async (label) => {
         await prisma.job_label.create({
            data: {
               job_id: job.job_id,
               label: label
            }
         })
      })

      // Partition creation
      const encodedFiles = await Promise.all(files)
      const numImages = encodedFiles.length

      let partitionInfo = {
         splitArr: [],
         ids: []
      }

      const partitionSize = Math.floor(numImages / num_partitions)

      for (let i = 0; i < num_partitions - 1; i++) {
         partitionInfo.splitArr.push(
            encodedFiles.slice(i * partitionSize, (i + 1) * partitionSize)
               .length
         )

         partitionInfo.ids.push(
            (
               await prisma.job_partition.create({
                  data: {
                     job_id: job.job_id,
                     partition_number: i
                  }
               })
            ).partition_id
         )
      }

      partitionInfo.splitArr.push(
         encodedFiles.slice((num_partitions - 1) * partitionSize).length
      )

      partitionInfo.ids.push(
         (
            await prisma.job_partition.create({
               data: {
                  job_id: job.job_id,
                  partition_number: num_partitions - 1
               }
            })
         ).partition_id
      )

      // Job images
      let filenames = []
      let streams = []

      for (let i = 0; i < numImages; i++) {
         const { createReadStream, filename } = await encodedFiles[i]

         filenames.push(filename)
         var stream = createReadStream()
         streams.push(stream)
      }

      const imgIds = await gDrive.uploadStreams(filenames, streams)

      const urls = imgIds.map(
         (imgId) => `https://drive.google.com/uc?id=${imgId}`
      )

      // Image table population
      let startIdx = 0
      for (let i = 0; i < partitionInfo.splitArr.length; i++) {
         for (let j = 0; j < partitionInfo.splitArr[i]; j++) {
            await prisma.job_image.create({
               data: {
                  image_uri: urls[j + startIdx],
                  partition_id: partitionInfo.ids[i]
               }
            })
         }

         startIdx = partitionInfo.splitArr[i]
      }

      return job
   },

   acceptJob: async (_, { job_id }, { user }) => {
      const currentUserId = user?.user_id

      // Find first available partition
      const partition = await prisma.job_partition.findFirst({
         where: {
            AND: [
               {
                  job_id: Number(job_id)
               },
               {
                  is_full: false
               }
            ]
         }
      })

      if (!partition) return false

      // Find number of labels assigned to job
      const numLabels = await prisma.job_label.count({
         where: {
            job_id: Number(job_id)
         }
      })

      // Maximum number of people per partition
      const maxNumLabellers = numLabels % 2 === 0 ? numLabels + 1 : numLabels

      const numLabellersAssigned = await prisma.job_labeller.count({
         where: {
            partition_id: partition.partition_id
         }
      })

      if (numLabellersAssigned === maxNumLabellers - 1) {
         await prisma.job_partition.update({
            where: {
               partition_id: partition.partition_id
            },
            data: {
               is_full: true
            }
         })
      }

      const newLabeller = await prisma.job_labeller.create({
         data: {
            job_id: Number(job_id),
            user_id: currentUserId,
            partition_id: partition.partition_id
         }
      })

      if (!newLabeller) return false

      return true
   }
}

module.exports = mutations