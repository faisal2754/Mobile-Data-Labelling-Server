const { gql } = require('apollo-server-express')

const typeDefs = gql`
   scalar Upload
   scalar Date

   type File {
      filename: String!
      mimetype: String!
      encoding: String!
   }

   type User {
      user_id: ID!
      username: String!
      email: String!
      password: String!
      avatar: String
      balance: Int
      jwt: String
   }

   type Job {
      job_id: ID!
      job_owner: User!
      title: String!
      description: String!
      credits: Int!
      created_at: Date!
      preview_images: [String]
   }

   type LabelJobInfo {
      title: String!
      labels: [String]!
      image_ids: [ID]!
      images: [String]!
   }

   type LabelJobState {
      image_ids: [ID]!
      labels: [String]!
   }

   type Query {
      me: User
      users: [User]
      user(email: String!): User
      viewJobs: [Job]
      labelJobInfo(job_id: ID!): LabelJobInfo
      labelJobState(partition_id: ID!): LabelJobState
   }

   type Mutation {
      register(username: String!, email: String!, password: String!): User
      login(email: String!, password: String!): User
      editProfile(username: String, password: String, avatar: String): User
      createJob(
         title: String!
         description: String!
         credits: Int!
         labels: [String]!
         num_partitions: Int!
         files: [Upload]
      ): Job
      acceptJob(job_id: ID!): Boolean
      saveState(
         image_ids: [ID]!
         labels: [String]!
         partition_id: ID
         is_complete: Boolean
      ): Boolean
   }
`

module.exports = typeDefs
